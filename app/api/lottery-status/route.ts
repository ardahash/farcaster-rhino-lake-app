import { NextResponse } from "next/server"
import { CONTRACTS, LOTTERY_ABI } from "@/lib/contracts"
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

    const client = getPublicClient()
    const quotes = await getTicketQuotes()
    const treasuryAddress = getRewardWallet().address
    const lotteryAddress = CONTRACTS.LOTTERY

    if (lotteryAddress) {
      const currentRoundId = (await client.readContract({
        address: lotteryAddress,
        abi: LOTTERY_ABI,
        functionName: "currentRoundId",
      })) as bigint

      if (currentRoundId === 0n) {
        return NextResponse.json({ error: "Lottery not started yet." }, { status: 400 })
      }

      const round = (await client.readContract({
        address: lotteryAddress,
        abi: LOTTERY_ABI,
        functionName: "getRound",
        args: [currentRoundId],
      })) as {
        startAt: bigint
        endAt: bigint
        ticketPriceBanda: bigint
        ticketPriceUsdc: bigint
        potUsdcInitial: bigint
        potUsdcFromTickets: bigint
        potUsdcTotal: bigint
        totalTickets: bigint
        winner: string
        requestId: bigint
        settled: boolean
      }

      const userTickets = address
        ? ((await client.readContract({
            address: lotteryAddress,
            abi: LOTTERY_ABI,
            functionName: "getTickets",
            args: [currentRoundId, address as `0x${string}`],
          })) as bigint)
        : 0n

      const remainingTickets = Math.max(MAX_TICKETS_PER_USER - Number(userTickets), 0)

      const historyRounds: Array<{
        id: string
        startAt: number
        endAt: number
        totalTickets: number
        potUsdcTotal: string
        winners: Array<{ address: string; amountUsdc: string; claimed: boolean }>
      }> = []

      let unclaimedWinningsRaw = 0n
      let unclaimedRoundId: number | null = null

      const maxHistory = 10
      const latestId = Number(currentRoundId)
      const startId = Math.max(1, latestId - maxHistory)

      for (let id = latestId; id >= startId; id -= 1) {
        const roundData = (await client.readContract({
          address: lotteryAddress,
          abi: LOTTERY_ABI,
          functionName: "getRound",
          args: [BigInt(id)],
        })) as {
          startAt: bigint
          endAt: bigint
          ticketPriceBanda: bigint
          ticketPriceUsdc: bigint
          potUsdcInitial: bigint
          potUsdcFromTickets: bigint
          potUsdcTotal: bigint
          totalTickets: bigint
          winner: string
          requestId: bigint
          settled: boolean
        }

        if (roundData.startAt === 0n) {
          continue
        }

        const winner = roundData.winner
        const potUsdc = roundData.potUsdcTotal
        let claimed = false
        if (address && winner.toLowerCase() === address.toLowerCase()) {
          claimed = (await client.readContract({
            address: lotteryAddress,
            abi: LOTTERY_ABI,
            functionName: "isClaimed",
            args: [BigInt(id), address as `0x${string}`],
          })) as boolean
          if (!claimed && potUsdc > 0n) {
            unclaimedWinningsRaw += potUsdc
            if (!unclaimedRoundId) {
              unclaimedRoundId = id
            }
          }
        }

        historyRounds.push({
          id: `lottery-${id}`,
          startAt: Number(roundData.startAt),
          endAt: Number(roundData.endAt),
          totalTickets: Number(roundData.totalTickets),
          potUsdcTotal: formatUsdc(potUsdc),
          winners:
            roundData.winner && roundData.winner !== "0x0000000000000000000000000000000000000000"
              ? [
                  {
                    address: roundData.winner,
                    amountUsdc: formatUsdc(potUsdc),
                    claimed,
                  },
                ]
              : [],
        })
      }

      const usdcAddress = process.env.NEXT_PUBLIC_USDC_ADDRESS
      let potProjected = round.potUsdcInitial + round.potUsdcFromTickets
      if (usdcAddress) {
        const balance = (await client.readContract({
          address: usdcAddress as `0x${string}`,
          abi: [
            {
              type: "function",
              name: "balanceOf",
              stateMutability: "view",
              inputs: [{ name: "account", type: "address" }],
              outputs: [{ name: "", type: "uint256" }],
            },
          ],
          functionName: "balanceOf",
          args: [lotteryAddress],
        })) as bigint
        if (potProjected > balance) {
          potProjected = balance
        }
      }

      return NextResponse.json({
        current: {
          id: `lottery-${currentRoundId.toString()}`,
          startAt: Number(round.startAt),
          endAt: Number(round.endAt),
          ticketPriceBandaRaw: quotes.bandaBaseRaw.toString(),
          ticketPriceBanda: quotes.bandaDisplay,
          ticketUsdcBaseRaw: quotes.usdcBaseRaw.toString(),
          ticketUsdcRaw: quotes.usdcTotalRaw.toString(),
          ticketUsdcApprox: quotes.usdcDisplay,
          totalTickets: Number(round.totalTickets),
          potUsdcInitial: formatUsdc(round.potUsdcInitial),
          potUsdcFromTickets: formatUsdc(round.potUsdcFromTickets),
          potUsdcTotal: formatUsdc(potProjected),
          status: round.settled ? "closed" : "open",
        },
        user: {
          tickets: Number(userTickets),
          remainingTickets,
          maxTickets: MAX_TICKETS_PER_USER,
          unclaimedWinnings: formatUsdc(unclaimedWinningsRaw),
          hasUnclaimedWinnings: unclaimedWinningsRaw > 0n,
          unclaimedRoundId,
        },
        treasuryAddress,
        history: historyRounds,
        bandaDecimals: BANDA_DECIMALS,
      })
    }

    const state = await ensureCurrentLottery()
    const current = state.current
    if (!current) {
      return NextResponse.json({ error: "Lottery unavailable." }, { status: 500 })
    }

    const potUpdate = await recalcRoundPot(current, client)
    current.totalTickets = potUpdate.totalTickets
    current.potUsdcFromTicketsRaw = potUpdate.potUsdcFromTicketsRaw
    current.potUsdcTotalRaw = potUpdate.potUsdcTotalRaw

    const userTickets = address ? getUserTickets(current, address) : 0
    const remainingTickets = Math.max(MAX_TICKETS_PER_USER - userTickets, 0)
    const unclaimedWinningsRaw = address ? getUserUnclaimedWinnings(state, address) : 0n

    return NextResponse.json({
      current: {
        id: current.id,
        startAt: current.startAt,
        endAt: current.endAt,
        ticketPriceBandaRaw: quotes.bandaBaseRaw.toString(),
        ticketPriceBanda: quotes.bandaDisplay,
        ticketUsdcBaseRaw: quotes.usdcBaseRaw.toString(),
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
