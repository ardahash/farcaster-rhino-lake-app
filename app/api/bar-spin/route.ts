import { NextResponse } from "next/server"
import { createPublicClient, createWalletClient, http, parseUnits } from "viem"
import { privateKeyToAccount } from "viem/accounts"
import { base } from "viem/chains"
import { SPIN_REWARDS, SPIN_WINDOW_MS } from "@/lib/bar-spin"
import { CONTRACT_ADDRESSES } from "@/lib/contract-addresses"

export const runtime = "nodejs"

const lastSpinByAddress = new Map<string, number>()

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

const CITY_NFT_ABI = [
  {
    type: "function",
    name: "cityOf",
    stateMutability: "view",
    inputs: [{ name: "owner", type: "address" }],
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

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { address?: string; cityId?: string }
    if (!body?.address || !isHexAddress(body.address)) {
      return NextResponse.json({ error: "Invalid address." }, { status: 400 })
    }

    const normalized = body.address.toLowerCase()
    const lastSpin = lastSpinByAddress.get(normalized)
    if (lastSpin && Date.now() - lastSpin < SPIN_WINDOW_MS) {
      return NextResponse.json({ error: "Spin is on cooldown." }, { status: 429 })
    }

    const rpcUrl = getRpcUrl()
    const publicClient = createPublicClient({
      chain: base,
      transport: http(rpcUrl),
    })

    const cityId = await publicClient.readContract({
      address: CONTRACT_ADDRESSES.CITY_NFT,
      abi: CITY_NFT_ABI,
      functionName: "cityOf",
      args: [body.address as `0x${string}`],
    })
    if ((cityId as bigint) <= 0n) {
      return NextResponse.json({ error: "City not found." }, { status: 400 })
    }

    const reward = SPIN_REWARDS[Math.floor(Math.random() * SPIN_REWARDS.length)]

    const decimals = (await publicClient.readContract({
      address: CONTRACT_ADDRESSES.BAR,
      abi: ERC20_READ_ABI,
      functionName: "decimals",
    })) as number

    const amountRaw = parseUnits(reward, decimals)
    const account = getRewardWallet()

    const treasuryBalance = (await publicClient.readContract({
      address: CONTRACT_ADDRESSES.BAR,
      abi: ERC20_READ_ABI,
      functionName: "balanceOf",
      args: [account.address],
    })) as bigint

    if (treasuryBalance < amountRaw) {
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

    lastSpinByAddress.set(normalized, Date.now())
    return NextResponse.json({ amount: reward, txHash: hash })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Spin failed."
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
