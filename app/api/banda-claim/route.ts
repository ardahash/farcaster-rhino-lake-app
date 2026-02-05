import { NextResponse } from "next/server"
import { createPublicClient, formatUnits, http, parseUnits } from "viem"
import { privateKeyToAccount } from "viem/accounts"
import { base } from "viem/chains"
import { CONTRACT_ADDRESSES } from "@/lib/contract-addresses"
import { BANDA_TIERS, getBandaTier, getBandaTierIndex } from "@/lib/army-tiers"

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
  const rewardContract = process.env.NEXT_PUBLIC_BANDA_MINING_REWARD_ADDRESS
  if (!rewardContract) {
    throw new Error("BANDA mining reward contract is not configured.")
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
    const body = (await request.json()) as { address?: string; seconds?: number }
    if (!body?.address || !isHexAddress(body.address)) {
      return NextResponse.json({ error: "Invalid address." }, { status: 400 })
    }
    if (!body?.seconds || body.seconds <= 0) {
      return NextResponse.json({ error: "No Army power to claim yet." }, { status: 400 })
    }

    const rpcUrl = getRpcUrl()
    const publicClient = createPublicClient({
      chain: base,
      transport: http(rpcUrl),
    })

    const decimals = (await publicClient.readContract({
      address: CONTRACT_ADDRESSES.BANDA,
      abi: ERC20_READ_ABI,
      functionName: "decimals",
    })) as number

    const bandaNftAddress = CONTRACT_ADDRESSES.BANDA_NFT
    if (!bandaNftAddress) {
      return NextResponse.json({ error: "BANDA NFT contract not configured." }, { status: 500 })
    }

    const purchasableTiers = BANDA_TIERS.filter((tier) => tier.tokenId > 0)
    const nftContracts = purchasableTiers.map((tier) => ({
      address: bandaNftAddress,
      abi: ERC1155_READ_ABI,
      functionName: "balanceOf" as const,
      args: [body.address as `0x${string}`, BigInt(tier.tokenId)],
    }))

    const nftBalances = await publicClient.multicall({
      contracts: nftContracts,
      allowFailure: true,
    })

    let highestTier = getBandaTier("starter")
    nftBalances.forEach((result, index) => {
      const tier = purchasableTiers[index]
      if (!tier) return
      if (result.status === "success" && typeof result.result === "bigint" && result.result > 0n) {
        if (getBandaTierIndex(tier.id) > getBandaTierIndex(highestTier.id)) {
          highestTier = tier
        }
      }
    })

    const ratePerSecond = highestTier.ratePerSecond
    const totalRaw = parseUnits((ratePerSecond * body.seconds).toString(), decimals)
    if (totalRaw <= 0n) {
      return NextResponse.json({ error: "No Army power to claim yet." }, { status: 400 })
    }

    const signer = getRewardWallet()
    const rewardContract = getRewardContractAddress()
    const treasuryBalanceRaw = (await publicClient.readContract({
      address: CONTRACT_ADDRESSES.BANDA,
      abi: ERC20_READ_ABI,
      functionName: "balanceOf",
      args: [rewardContract],
    })) as bigint

    if (treasuryBalanceRaw <= 0n) {
      return NextResponse.json({ error: "Treasury is empty." }, { status: 400 })
    }

    const amountRaw = treasuryBalanceRaw < totalRaw ? treasuryBalanceRaw : totalRaw

    const nonce = (await publicClient.readContract({
      address: rewardContract,
      abi: REWARD_NONCE_ABI,
      functionName: "nonces",
      args: [body.address as `0x${string}`],
    })) as bigint

    const deadline = Math.floor(Date.now() / 1000) + 10 * 60
    const signature = await signer.signTypedData({
      domain: { ...CLAIM_DOMAIN, chainId: base.id, verifyingContract: rewardContract },
      types: CLAIM_TYPES,
      primaryType: "Claim",
      message: {
        account: body.address as `0x${string}`,
        amount: amountRaw,
        nonce,
        deadline,
      },
    })

    return NextResponse.json({
      amount: formatUnits(amountRaw, decimals),
      amountRaw: amountRaw.toString(),
      tier: highestTier.id,
      ratePerSecond,
      treasuryBalance: formatUnits(treasuryBalanceRaw, decimals),
      claim: {
        contract: rewardContract,
        nonce: nonce.toString(),
        deadline,
        signature,
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Claim failed."
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
