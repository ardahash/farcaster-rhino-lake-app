import { NextResponse } from "next/server"
import { createPublicClient, createWalletClient, http, parseUnits } from "viem"
import { privateKeyToAccount } from "viem/accounts"
import { base } from "viem/chains"
import { formatUnits } from "viem"
import { CONTRACT_ADDRESSES } from "@/lib/contract-addresses"
import { getMiningCount, resetMiningCount, setMiningCount } from "@/lib/mining-store"
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

const ERC20_TRANSFER_ABI = [
  {
    type: "function",
    name: "transfer",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
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

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { address?: string; clicks?: number }
    if (!body?.address || !isHexAddress(body.address)) {
      return NextResponse.json({ error: "Invalid address." }, { status: 400 })
    }

    const normalized = body.address.toLowerCase()
    let clickCount = getMiningCount(normalized)
    if (clickCount <= 0 && typeof body.clicks === "number") {
      clickCount = setMiningCount(normalized, body.clicks)
    }
    if (clickCount <= 0) {
      return NextResponse.json({ error: "No mining clicks available." }, { status: 400 })
    }

    const rpcUrl = getRpcUrl()
    const publicClient = createPublicClient({
      chain: base,
      transport: http(rpcUrl),
    })

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
    const account = getRewardWallet()

    const treasuryBalanceRaw = (await publicClient.readContract({
      address: CONTRACT_ADDRESSES.BAR,
      abi: ERC20_READ_ABI,
      functionName: "balanceOf",
      args: [account.address],
    })) as bigint

    const maxClicks = perClickRaw > 0n ? Number(treasuryBalanceRaw / perClickRaw) : 0
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

    const walletClient = createWalletClient({
      chain: base,
      transport: http(rpcUrl),
      account,
    })

    const hash = await walletClient.writeContract({
      address: CONTRACT_ADDRESSES.BAR,
      abi: ERC20_TRANSFER_ABI,
      functionName: "transfer",
      args: [body.address as `0x${string}`, amountRaw],
    })

    await publicClient.waitForTransactionReceipt({ hash })

    resetMiningCount(normalized)

    const refreshedBalanceRaw = (await publicClient.readContract({
      address: CONTRACT_ADDRESSES.BAR,
      abi: ERC20_READ_ABI,
      functionName: "balanceOf",
      args: [account.address],
    })) as bigint
    const refreshedMaxClicks = perClickRaw > 0n ? Number(refreshedBalanceRaw / perClickRaw) : 0

    return NextResponse.json({
      clicks: clickCount,
      amount: (Number(clickCount) * rewardPerClick).toString(),
      txHash: hash,
      tier: highestTier.id,
      rewardPerClick,
      treasuryBalance: formatUnits(refreshedBalanceRaw, decimals),
      maxClicks: refreshedMaxClicks,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Claim failed."
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
