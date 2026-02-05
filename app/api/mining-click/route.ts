import { NextResponse } from "next/server"
import { createPublicClient, http, parseUnits } from "viem"
import { base } from "viem/chains"
import { CONTRACT_ADDRESSES } from "@/lib/contract-addresses"
import { MAX_CLICKS_PER_REQUEST, consumeMiningClicks, getMiningCount } from "@/lib/mining-store"
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

const isHexAddress = (value: string) => /^0x[a-fA-F0-9]{40}$/.test(value)

const getRpcUrl = () => {
  const rpcUrl = process.env.NEXT_PUBLIC_BASE_RPC_URL
  if (!rpcUrl) {
    throw new Error("Missing Base RPC URL.")
  }
  return rpcUrl
}

const getRewardContractAddress = () => {
  const rewardContract = process.env.NEXT_PUBLIC_BAR_MINING_REWARD_ADDRESS
  if (!rewardContract) {
    throw new Error("BAR mining reward contract is not configured.")
  }
  return rewardContract as `0x${string}`
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { address?: string; count?: number }
    if (!body?.address || !isHexAddress(body.address)) {
      return NextResponse.json({ error: "Invalid address." }, { status: 400 })
    }

    const normalized = body.address.toLowerCase()

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

    const treasuryBalanceRaw = (await publicClient.readContract({
      address: CONTRACT_ADDRESSES.BAR,
      abi: ERC20_READ_ABI,
      functionName: "balanceOf",
      args: [getRewardContractAddress()],
    })) as bigint

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
    const maxClicks = perClickRaw > 0n ? Number(treasuryBalanceRaw / perClickRaw) : 0
    const current = getMiningCount(normalized)
    if (current >= maxClicks) {
      return NextResponse.json(
        { error: "Mining paused. Treasury is empty.", count: current, maxClicks },
        { status: 400 },
      )
    }

    const requested = typeof body.count === "number" ? Math.floor(body.count) : 1
    if (!Number.isFinite(requested) || requested <= 0) {
      return NextResponse.json({ error: "Invalid click count." }, { status: 400 })
    }

    const remaining = Math.max(maxClicks - current, 0)
    if (remaining <= 0) {
      return NextResponse.json(
        { error: "Mining paused. Treasury is empty.", count: current, maxClicks },
        { status: 400 },
      )
    }

    const allowedRequest = Math.min(requested, remaining, MAX_CLICKS_PER_REQUEST)
    const result = consumeMiningClicks(normalized, allowedRequest)
    if (result.accepted <= 0) {
      return NextResponse.json({ error: "Mining too fast. Slow down." }, { status: 429 })
    }

    return NextResponse.json({
      count: result.count,
      accepted: result.accepted,
      maxClicks,
      rewardPerClick,
      tier: highestTier.id,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Mining failed."
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
