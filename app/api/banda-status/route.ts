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

const isHexAddress = (value: string) => /^0x[a-fA-F0-9]{40}$/.test(value)

const getRpcUrl = () => {
  const rpcUrl = process.env.NEXT_PUBLIC_BASE_RPC_URL
  if (!rpcUrl) {
    throw new Error("Missing Base RPC URL.")
  }
  return rpcUrl
}

const getRewardWalletAddress = () => {
  const rawKey = process.env.BAR_REWARD_PRIVATE_KEY
  if (!rawKey) {
    throw new Error("Reward wallet is not configured.")
  }
  const privateKey = rawKey.startsWith("0x") ? rawKey : `0x${rawKey}`
  return privateKeyToAccount(privateKey as `0x${string}`).address
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { address?: string }
    if (!body?.address || !isHexAddress(body.address)) {
      return NextResponse.json({ error: "Invalid address." }, { status: 400 })
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

    const treasuryBalanceRaw = (await publicClient.readContract({
      address: CONTRACT_ADDRESSES.BANDA,
      abi: ERC20_READ_ABI,
      functionName: "balanceOf",
      args: [getRewardWalletAddress()],
    })) as bigint

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

    const ownedTokenIds: number[] = []
    let highestTier = getBandaTier("starter")
    nftBalances.forEach((result, index) => {
      const tier = purchasableTiers[index]
      if (!tier) return
      if (result.status === "success" && typeof result.result === "bigint" && result.result > 0n) {
        ownedTokenIds.push(tier.tokenId)
        if (getBandaTierIndex(tier.id) > getBandaTierIndex(highestTier.id)) {
          highestTier = tier
        }
      }
    })

    const ratePerSecond = highestTier.ratePerSecond
    const perSecondRaw = parseUnits(ratePerSecond.toString(), decimals)
    const maxSeconds = perSecondRaw > 0n ? Number(treasuryBalanceRaw / perSecondRaw) : 0

    return NextResponse.json({
      tier: highestTier.id,
      ratePerSecond,
      ownedTokenIds,
      treasuryBalance: formatUnits(treasuryBalanceRaw, decimals),
      maxSeconds,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load BANDA data."
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
