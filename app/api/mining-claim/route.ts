import { NextResponse } from "next/server"
import { createPublicClient, http, parseUnits } from "viem"
import { privateKeyToAccount } from "viem/accounts"
import { base } from "viem/chains"
import { formatUnits } from "viem"
import { CONTRACT_ADDRESSES } from "@/lib/contract-addresses"
import {
  canClaimMining,
  clearPendingMiningClaim,
  getMiningCount,
  getPendingMiningClaim,
  resetMiningCount,
  setMiningCount,
  setPendingMiningClaim,
} from "@/lib/mining-store"
import { PICKAXE_TIERS, getPickaxeTier, getTierIndex } from "@/lib/mining-tiers"

export const runtime = "nodejs"

const ERC20_READ_ABI = [
  {
    type: "function",
    name: "decimals",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint8" }],
  },
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const

const ERC1155_READ_ABI = [
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [
      { name: "account", type: "address" },
      { name: "id", type: "uint256" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const

const REWARD_NONCE_ABI = [
  {
    type: "function",
    name: "nonces",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const

const isHexAddress = (value: string) => /^0x[a-fA-F0-9]{40}$/.test(value)

const getRpcUrl = () => {
  const rpcUrl = process.env.NEXT_PUBLIC_BASE_RPC_URL
  if (!rpcUrl) {
    throw new Error("Missing Base RPC URL.")
  }
  return rpcUrl
}

const getRewardWallet = () => {
  const rawKey = process.env.BAR_REWARD_PRIVATE_KEY
  if (!rawKey) {
    throw new Error("Reward wallet is not configured.")
  }
  const privateKey = rawKey.startsWith("0x") ? rawKey : `0x${rawKey}`
  return privateKeyToAccount(privateKey as `0x${string}`)
}

const getRewardContractAddress = () => {
  const rewardContract = process.env.NEXT_PUBLIC_BAR_MINING_REWARD_ADDRESS
  if (!rewardContract) {
    throw new Error("BAR mining reward contract is not configured.")
  }
  return rewardContract as `0x${string}`
}

const CLAIM_DOMAIN = {
  name: "RhinoLakeMiningRewards",
  version: "1",
} as const

const CLAIM_TYPES = {
  Claim: [
    { name: "account", type: "address" },
    { name: "amount", type: "uint256" },
    { name: "nonce", type: "uint256" },
    { name: "deadline", type: "uint256" },
  ],
} as const

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { address?: string; clicks?: number }
    if (!body?.address || !isHexAddress(body.address)) {
      return NextResponse.json({ error: "Invalid address." }, { status: 400 })
    }

    const normalized = body.address.toLowerCase()

    const rpcUrl = getRpcUrl()
    const publicClient = createPublicClient({
      chain: base,
      transport: http(rpcUrl),
    })

    const rewardContract = getRewardContractAddress()
    const signer = getRewardWallet()

    const decimals = (await publicClient.readContract({
      address: CONTRACT_ADDRESSES.BAR,
      abi: ERC20_READ_ABI,
      functionName: "decimals",
    })) as number

    const pickaxeAddress = CONTRACT_ADDRESSES.PICKAXE_NFT
    if (!pickaxeAddress) {
      return NextResponse.json({ error: "Pickaxe contract not configured." }, { status: 500 })
    }

    const purchasableTiers = PICKAXE_TIERS.filter((tier) => tier.tokenId > 0)
    const pickaxeContracts = purchasableTiers.map((tier) => ({
      address: pickaxeAddress,
      abi: ERC1155_READ_ABI,
      functionName: "balanceOf" as const,
      args: [body.address as `0x${string}`, BigInt(tier.tokenId)],
    }))

    const pickaxeBalances = await publicClient.multicall({
      contracts: pickaxeContracts,
      allowFailure: true,
    })

    let highestTier = getPickaxeTier("starter")
    pickaxeBalances.forEach((result, index) => {
      const tier = purchasableTiers[index]
      if (!tier) return
      if (result.status === "success" && typeof result.result === "bigint" && result.result > 0n) {
        if (getTierIndex(tier.id) > getTierIndex(highestTier.id)) {
          highestTier = tier
        }
      }
    })

    const rewardPerClick = highestTier.rewardPerClick
    const perClickRaw = parseUnits(rewardPerClick.toString(), decimals)

    const treasuryBalanceRaw = (await publicClient.readContract({
      address: CONTRACT_ADDRESSES.BAR,
      abi: ERC20_READ_ABI,
      functionName: "balanceOf",
      args: [rewardContract],
    })) as bigint

    const maxClicks = perClickRaw > 0n ? Number(treasuryBalanceRaw / perClickRaw) : 0

    const chainNonce = (await publicClient.readContract({
      address: rewardContract,
      abi: REWARD_NONCE_ABI,
      functionName: "nonces",
      args: [body.address as `0x${string}`],
    })) as bigint

    let pending = getPendingMiningClaim(normalized)
    if (pending && chainNonce > pending.nonce) {
      clearPendingMiningClaim(normalized)
      pending = undefined
    }

    if (pending && chainNonce === pending.nonce) {
      const now = Math.floor(Date.now() / 1000)
      let deadline = pending.deadline
      let signature = pending.signature
      if (deadline <= now + 30) {
        deadline = now + 10 * 60
        signature = await signer.signTypedData({
          domain: { ...CLAIM_DOMAIN, chainId: base.id, verifyingContract: rewardContract },
          types: CLAIM_TYPES,
          primaryType: "Claim",
          message: {
            account: body.address as `0x${string}`,
            amount: pending.amountRaw,
            nonce: pending.nonce,
            deadline,
          },
        })
        pending = setPendingMiningClaim(normalized, {
          ...pending,
          deadline,
          signature,
        })
      }

      return NextResponse.json({
        clicks: pending.clicks,
        amount: pending.amount,
        amountRaw: pending.amountRaw.toString(),
        tier: highestTier.id,
        rewardPerClick,
        treasuryBalance: formatUnits(treasuryBalanceRaw, decimals),
        maxClicks,
        claim: {
          contract: rewardContract,
          nonce: pending.nonce.toString(),
          deadline,
          signature,
        },
      })
    }

    if (!canClaimMining(normalized)) {
      return NextResponse.json({ error: "Claim cooldown active. Try again in a moment." }, { status: 429 })
    }

    let clickCount = getMiningCount(normalized)
    if (clickCount <= 0) {
      return NextResponse.json({ error: "No mining clicks available." }, { status: 400 })
    }

    if (clickCount > maxClicks) {
      clickCount = setMiningCount(normalized, maxClicks)
    }
    if (clickCount <= 0) {
      return NextResponse.json({ error: "Treasury is empty." }, { status: 400 })
    }

    const amountRaw = perClickRaw * BigInt(clickCount)
    if (treasuryBalanceRaw < amountRaw) {
      return NextResponse.json({ error: "Reward treasury has insufficient BAR." }, { status: 400 })
    }

    const deadline = Math.floor(Date.now() / 1000) + 10 * 60
    const signature = await signer.signTypedData({
      domain: { ...CLAIM_DOMAIN, chainId: base.id, verifyingContract: rewardContract },
      types: CLAIM_TYPES,
      primaryType: "Claim",
      message: {
        account: body.address as `0x${string}`,
        amount: amountRaw,
        nonce: chainNonce,
        deadline,
      },
    })

    setPendingMiningClaim(normalized, {
      clicks: clickCount,
      amountRaw,
      amount: (Number(clickCount) * rewardPerClick).toString(),
      nonce: chainNonce,
      deadline,
      signature,
    })

    resetMiningCount(normalized)

    return NextResponse.json({
      clicks: clickCount,
      amount: (Number(clickCount) * rewardPerClick).toString(),
      amountRaw: amountRaw.toString(),
      tier: highestTier.id,
      rewardPerClick,
      treasuryBalance: formatUnits(treasuryBalanceRaw, decimals),
      maxClicks,
      claim: {
        contract: rewardContract,
        nonce: chainNonce.toString(),
        deadline,
        signature,
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Claim failed."
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
