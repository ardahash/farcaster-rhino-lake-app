import { NextResponse } from "next/server"
import { decodeEventLog } from "viem"
import { CONTRACT_ADDRESSES } from "@/lib/contract-addresses"
import {
  MAX_TICKETS_PER_USER,
  ensureCurrentLottery,
  getPublicClient,
  getRewardWallet,
  getTicketQuotes,
  getUserTickets,
  recalcRoundPot,
  recordTicketPurchase,
  saveLotteryState,
  transferLogTopic,
} from "@/lib/lottery"

export const runtime = "nodejs"

const isHexAddress = (value: string) => /^0x[a-fA-F0-9]{40}$/.test(value)
const isHexHash = (value: string) => /^0x[a-fA-F0-9]{64}$/.test(value)

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      address?: string
      count?: number
      txHash?: string
      paymentToken?: "banda" | "usdc"
    }
    if (!body?.address || !isHexAddress(body.address)) {
      return NextResponse.json({ error: "Invalid address." }, { status: 400 })
    }
    const count = Number(body.count)
    if (!Number.isFinite(count) || count <= 0) {
      return NextResponse.json({ error: "Invalid ticket count." }, { status: 400 })
    }
    if (!body?.txHash || !isHexHash(body.txHash)) {
      return NextResponse.json({ error: "Missing ticket purchase transaction." }, { status: 400 })
    }
    const paymentToken = body.paymentToken === "usdc" ? "usdc" : "banda"

    const state = await ensureCurrentLottery()
    const current = state.current
    if (!current || current.status !== "open") {
      return NextResponse.json({ error: "Lottery is not open yet." }, { status: 400 })
    }
    if (Date.now() >= current.endAt) {
      return NextResponse.json({ error: "Lottery round has ended." }, { status: 400 })
    }

    const currentUserTickets = getUserTickets(current, body.address)
    if (currentUserTickets + count > MAX_TICKETS_PER_USER) {
      return NextResponse.json(
        { error: `Ticket limit reached. Max ${MAX_TICKETS_PER_USER} per round.` },
        { status: 400 },
      )
    }

    const quotes = await getTicketQuotes()
    const requiredBandaRaw = quotes.bandaBaseRaw * BigInt(count)
    const requiredUsdcRaw = quotes.usdcTotalRaw * BigInt(count)
    if (requiredBandaRaw <= 0n || requiredUsdcRaw <= 0n) {
      return NextResponse.json({ error: "Ticket price unavailable. Try again soon." }, { status: 500 })
    }

    const client = getPublicClient()
    const receipt = await client.getTransactionReceipt({ hash: body.txHash as `0x${string}` })
    if (!receipt || receipt.status !== "success") {
      return NextResponse.json({ error: "Ticket purchase transaction failed." }, { status: 400 })
    }

    const treasuryAddress = getRewardWallet().address.toLowerCase()
    const buyer = body.address.toLowerCase()
    const tokenAddress =
      paymentToken === "usdc" ? process.env.NEXT_PUBLIC_USDC_ADDRESS ?? "" : CONTRACT_ADDRESSES.BANDA
    if (!tokenAddress) {
      return NextResponse.json({ error: "USDC address not configured." }, { status: 500 })
    }
    const requiredRaw = paymentToken === "usdc" ? requiredUsdcRaw : requiredBandaRaw
    const matchingLog = receipt.logs.find((log) => {
      if (log.address.toLowerCase() !== tokenAddress.toLowerCase()) return false
      try {
        const decoded = decodeEventLog({
          abi: [transferLogTopic],
          data: log.data,
          topics: log.topics,
        })
        const from = (decoded.args?.from as string | undefined)?.toLowerCase()
        const to = (decoded.args?.to as string | undefined)?.toLowerCase()
        const value = decoded.args?.value as bigint | undefined
        return from === buyer && to === treasuryAddress && Boolean(value && value >= requiredRaw)
      } catch {
        return false
      }
    })

    if (!matchingLog) {
      return NextResponse.json({ error: "Ticket purchase transfer not detected." }, { status: 400 })
    }

    const updatedRound = recordTicketPurchase(current, {
      address: body.address,
      count,
      txHash: body.txHash,
      purchasedAt: Date.now(),
      usdcValueRaw: (quotes.usdcBaseRaw * BigInt(count)).toString(),
      feeUsdcValueRaw: paymentToken === "usdc" ? (quotes.usdcFeeRaw * BigInt(count)).toString() : "0",
      paymentToken,
    })

    const potUpdate = await recalcRoundPot(updatedRound, client)
    updatedRound.totalTickets = potUpdate.totalTickets
    updatedRound.potUsdcFromTicketsRaw = potUpdate.potUsdcFromTicketsRaw
    updatedRound.potUsdcTotalRaw = potUpdate.potUsdcTotalRaw

    state.current = updatedRound
    saveLotteryState(state)

    return NextResponse.json({
      success: true,
      totalTickets: updatedRound.totalTickets,
      userTickets: getUserTickets(updatedRound, body.address),
      potUsdcTotal: updatedRound.potUsdcTotalRaw,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to buy tickets."
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
