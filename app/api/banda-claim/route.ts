import { NextResponse } from "next/server"
import { createPublicClient, createWalletClient, formatUnits, http, parseUnits } from "viem"
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

    const account = getRewardWallet()
    const treasuryBalanceRaw = (await publicClient.readContract({
      address: CONTRACT_ADDRESSES.BANDA,
      abi: ERC20_READ_ABI,
      functionName: "balanceOf",
      args: [account.address],
    })) as bigint

    if (treasuryBalanceRaw <= 0n) {
      return NextResponse.json({ error: "Treasury is empty." }, { status: 400 })
    }

    const amountRaw = treasuryBalanceRaw < totalRaw ? treasuryBalanceRaw : totalRaw

    const walletClient = createWalletClient({
      chain: base,
      transport: http(rpcUrl),
      account,
    })

    const hash = await walletClient.writeContract({
      address: CONTRACT_ADDRESSES.BANDA,
      abi: ERC20_TRANSFER_ABI,
      functionName: "transfer",
      args: [body.address as `0x${string}`, amountRaw],
    })

    await publicClient.waitForTransactionReceipt({ hash })

    const refreshedBalanceRaw = (await publicClient.readContract({
      address: CONTRACT_ADDRESSES.BANDA,
      abi: ERC20_READ_ABI,
      functionName: "balanceOf",
      args: [account.address],
    })) as bigint

    return NextResponse.json({
      amount: formatUnits(amountRaw, decimals),
      txHash: hash,
      tier: highestTier.id,
      ratePerSecond,
      treasuryBalance: formatUnits(refreshedBalanceRaw, decimals),
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Claim failed."
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
