import { NextResponse } from "next/server"
import { createWalletClient, http } from "viem"
import { base } from "viem/chains"
import {
  ensureCurrentLottery,
  formatUsdc,
  getPublicClient,
  getRewardWallet,
  getRpcUrl,
  getUsdcAddress,
  getUserUnclaimedWinnings,
  markWinningsClaimed,
  saveLotteryState,
} from "@/lib/lottery"

export const runtime = "nodejs"

const isHexAddress = (value: string) => /^0x[a-fA-F0-9]{40}$/.test(value)

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
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { address?: string }
    if (!body?.address || !isHexAddress(body.address)) {
      return NextResponse.json({ error: "Invalid address." }, { status: 400 })
    }

    const state = await ensureCurrentLottery()
    const unclaimedRaw = getUserUnclaimedWinnings(state, body.address)
    if (unclaimedRaw <= 0n) {
      return NextResponse.json({ error: "No winnings available." }, { status: 400 })
    }

    const rewardAccount = getRewardWallet()
    const usdcAddress = getUsdcAddress()
    const client = getPublicClient()
    const treasuryBalanceRaw = (await client.readContract({
      address: usdcAddress,
      abi: ERC20_TRANSFER_ABI,
      functionName: "balanceOf",
      args: [rewardAccount.address],
    })) as bigint

    if (treasuryBalanceRaw < unclaimedRaw) {
      return NextResponse.json({ error: "Treasury USDC is insufficient for payout." }, { status: 400 })
    }

    const walletClient = createWalletClient({
      chain: base,
      transport: http(getRpcUrl()),
      account: rewardAccount,
    })

    const hash = await walletClient.writeContract({
      address: usdcAddress,
      abi: ERC20_TRANSFER_ABI,
      functionName: "transfer",
      args: [body.address as `0x${string}`, unclaimedRaw],
    })

    await client.waitForTransactionReceipt({ hash })

    markWinningsClaimed(state, body.address)
    saveLotteryState(state)

    return NextResponse.json({
      amount: formatUsdc(unclaimedRaw),
      txHash: hash,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to claim winnings."
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
