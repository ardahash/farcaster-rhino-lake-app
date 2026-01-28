import { NextResponse } from "next/server"
import {
  BANDA_DECIMALS,
  MAX_TICKETS_PER_USER,
  ensureCurrentLottery,
  formatUsdc,
  getTicketQuotes,
  getPublicClient,
  getRewardWallet,
  getUserTickets,
  getUserUnclaimedWinnings,
  recalcRoundPot,
} from "@/lib/lottery"

export const runtime = "nodejs"

const isHexAddress = (value: string) => /^0x[a-fA-F0-9]{40}$/.test(value)

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { address?: string }
    const address = body?.address
    if (address && !isHexAddress(address)) {
      return NextResponse.json({ error: "Invalid address." }, { status: 400 })
    }

    const state = await ensureCurrentLottery()
    const client = getPublicClient()
    const current = state.current
    if (!current) {
      return NextResponse.json({ error: "Lottery unavailable." }, { status: 500 })
    }

    const potUpdate = await recalcRoundPot(current, client)
    current.totalTickets = potUpdate.totalTickets
    current.potUsdcFromTicketsRaw = potUpdate.potUsdcFromTicketsRaw
    current.potUsdcTotalRaw = potUpdate.potUsdcTotalRaw

    const quotes = await getTicketQuotes()

    const userTickets = address ? getUserTickets(current, address) : 0
    const remainingTickets = Math.max(MAX_TICKETS_PER_USER - userTickets, 0)
    const unclaimedWinningsRaw = address ? getUserUnclaimedWinnings(state, address) : 0n

    const treasuryAddress = getRewardWallet().address

    return NextResponse.json({
      current: {
        id: current.id,
        startAt: current.startAt,
        endAt: current.endAt,
        ticketPriceBandaRaw: quotes.bandaBaseRaw.toString(),
        ticketPriceBanda: quotes.bandaDisplay,
        ticketUsdcRaw: quotes.usdcTotalRaw.toString(),
        ticketUsdcApprox: quotes.usdcDisplay,
        totalTickets: current.totalTickets,
        potUsdcInitial: formatUsdc(BigInt(current.potUsdcInitialRaw || "0")),
        potUsdcFromTickets: formatUsdc(BigInt(current.potUsdcFromTicketsRaw || "0")),
        potUsdcTotal: formatUsdc(BigInt(current.potUsdcTotalRaw || "0")),
        status: current.status,
      },
      user: {
        tickets: userTickets,
        remainingTickets,
        maxTickets: MAX_TICKETS_PER_USER,
        unclaimedWinnings: formatUsdc(unclaimedWinningsRaw),
        hasUnclaimedWinnings: unclaimedWinningsRaw > 0n,
      },
      treasuryAddress,
      history: state.history.slice(0, 10).map((round) => ({
        id: round.id,
        startAt: round.startAt,
        endAt: round.endAt,
        totalTickets: round.totalTickets,
        potUsdcTotal: formatUsdc(BigInt(round.potUsdcTotalRaw || "0")),
        winners: round.winners.map((winner) => ({
          address: winner.address,
          amountUsdc: formatUsdc(BigInt(winner.amountUsdcRaw || "0")),
          claimed: winner.claimed,
        })),
      })),
      bandaDecimals: BANDA_DECIMALS,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load lottery."
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
