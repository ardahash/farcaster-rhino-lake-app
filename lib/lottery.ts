import fs from "fs"
import path from "path"
import { CdpClient } from "@coinbase/cdp-sdk"
import { createPublicClient, formatUnits, http, parseAbiItem } from "viem"
import { privateKeyToAccount } from "viem/accounts"
import { base } from "viem/chains"
import { CONTRACT_ADDRESSES } from "@/lib/contract-addresses"

export type LotteryTicketPurchase = {
  address: string
  count: number
  txHash: string
  purchasedAt: number
  usdcValueRaw?: string
  feeUsdcValueRaw?: string
  paymentToken?: "banda" | "usdc"
}

export type LotteryWinner = {
  address: string
  amountUsdcRaw: string
  claimed: boolean
  pickedAt: number
  ticketIndex: number
}

export type LotteryRound = {
  id: string
  startAt: number
  endAt: number
  ticketPriceBandaRaw: string
  ticketPriceBanda: string
  ticketUsdcRaw: string
  totalTickets: number
  potUsdcInitialRaw: string
  potUsdcFromTicketsRaw: string
  potUsdcTotalRaw: string
  tickets: LotteryTicketPurchase[]
  winners: LotteryWinner[]
  status: "open" | "closed"
}

export type LotteryState = {
  current: LotteryRound | null
  history: LotteryRound[]
}

export const WEEK_MS = 7 * 24 * 60 * 60 * 1000
export const MAX_TICKETS_PER_USER = 100
export const TICKET_ETH_WEI = 360000000000000n
export const TICKET_FEE_USDC_RAW = 100000n
export const USDC_DECIMALS = 6
export const BANDA_DECIMALS = 18

const LOTTERY_FILE = path.join(process.cwd(), "cache", "lottery.json")

export const getRpcUrl = () => {
  const rpcUrl = process.env.NEXT_PUBLIC_BASE_RPC_URL
  if (!rpcUrl) {
    throw new Error("Missing Base RPC URL.")
  }
  return rpcUrl
}

const getCdpClient = () => {
  const apiKeyId = process.env.CDP_API_KEY_ID
  const apiKeySecret = process.env.CDP_API_KEY_SECRET
  const walletSecret = process.env.CDP_WALLET_SECRET

  if (!apiKeyId || !apiKeySecret) {
    throw new Error("Missing CDP API credentials.")
  }

  return new CdpClient({
    apiKeyId,
    apiKeySecret,
    walletSecret,
  })
}

export const getRewardWallet = () => {
  const rawKey = process.env.BAR_REWARD_PRIVATE_KEY
  if (!rawKey) {
    throw new Error("Reward wallet is not configured.")
  }
  const privateKey = rawKey.startsWith("0x") ? rawKey : `0x${rawKey}`
  return privateKeyToAccount(privateKey as `0x${string}`)
}

export const getUsdcAddress = () => {
  const usdc = process.env.NEXT_PUBLIC_USDC_ADDRESS
  if (!usdc) {
    throw new Error("USDC address not configured.")
  }
  return usdc as `0x${string}`
}

export const getPublicClient = () =>
  createPublicClient({
    chain: base,
    transport: http(getRpcUrl()),
  })

const ensureLotteryFile = () => {
  const dir = path.dirname(LOTTERY_FILE)
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
  if (!fs.existsSync(LOTTERY_FILE)) {
    fs.writeFileSync(LOTTERY_FILE, JSON.stringify({ current: null, history: [] }, null, 2))
  }
}

export const loadLotteryState = (): LotteryState => {
  ensureLotteryFile()
  const raw = fs.readFileSync(LOTTERY_FILE, "utf-8")
  const parsed = JSON.parse(raw) as LotteryState
  return {
    current: parsed.current ?? null,
    history: Array.isArray(parsed.history) ? parsed.history : [],
  }
}

export const saveLotteryState = (state: LotteryState) => {
  ensureLotteryFile()
  fs.writeFileSync(LOTTERY_FILE, JSON.stringify(state, null, 2))
}

const fetchTicketPriceBandaRaw = async (): Promise<bigint> => {
  const cdp = getCdpClient()
  const taker = getRewardWallet().address
  const quote = await cdp.evm.createSwapQuote({
    network: "base",
    fromToken: "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE",
    toToken: CONTRACT_ADDRESSES.BANDA,
    fromAmount: TICKET_ETH_WEI,
    taker,
    slippageBps: 50,
  })

  if (!quote?.toAmount) {
    throw new Error("Unable to fetch $BANDA ticket price.")
  }
  return BigInt(quote.toAmount.toString())
}

const fetchTicketPriceUsdcRaw = async (): Promise<bigint> => {
  const cdp = getCdpClient()
  const taker = getRewardWallet().address
  const usdc = getUsdcAddress()
  const quote = await cdp.evm.createSwapQuote({
    network: "base",
    fromToken: "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE",
    toToken: usdc,
    fromAmount: TICKET_ETH_WEI,
    taker,
    slippageBps: 50,
  })

  if (!quote?.toAmount) {
    throw new Error("Unable to fetch USDC ticket price.")
  }
  return BigInt(quote.toAmount.toString())
}

export const formatUsdc = (raw: bigint) => formatUnits(raw, USDC_DECIMALS)
export const formatBanda = (raw: bigint) => formatUnits(raw, BANDA_DECIMALS)

export const getTicketQuotes = async () => {
  const [bandaRaw, usdcRaw] = await Promise.all([fetchTicketPriceBandaRaw(), fetchTicketPriceUsdcRaw()])
  const feeUsdcRaw = TICKET_FEE_USDC_RAW
  const feeBandaRaw = 0n
  const bandaTotalRaw = bandaRaw
  const usdcTotalRaw = usdcRaw + feeUsdcRaw
  return {
    bandaBaseRaw: bandaRaw,
    usdcBaseRaw: usdcRaw,
    bandaFeeRaw: feeBandaRaw,
    usdcFeeRaw: feeUsdcRaw,
    bandaTotalRaw,
    usdcTotalRaw,
    bandaDisplay: formatBanda(bandaTotalRaw),
    usdcDisplay: formatUsdc(usdcTotalRaw),
  }
}

const getRoundId = (startAt: number) => `lottery-${Math.floor(startAt / WEEK_MS)}`

const getTreasuryUsdcRaw = async (client = getPublicClient()) => {
  const account = getRewardWallet()
  const usdc = getUsdcAddress()
  return (await client.readContract({
    address: usdc,
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
    args: [account.address],
  })) as bigint
}

const buildNewRound = async (client = getPublicClient()): Promise<LotteryRound> => {
  const startAt = Date.now()
  const endAt = startAt + WEEK_MS
  const quotes = await getTicketQuotes()
  const treasuryUsdcRaw = await getTreasuryUsdcRaw(client)
  const potInitialRaw = treasuryUsdcRaw / 2n

  return {
    id: getRoundId(startAt),
    startAt,
    endAt,
    ticketPriceBandaRaw: quotes.bandaBaseRaw.toString(),
    ticketPriceBanda: formatBanda(quotes.bandaBaseRaw),
    ticketUsdcRaw: quotes.usdcBaseRaw.toString(),
    totalTickets: 0,
    potUsdcInitialRaw: potInitialRaw.toString(),
    potUsdcFromTicketsRaw: "0",
    potUsdcTotalRaw: potInitialRaw.toString(),
    tickets: [],
    winners: [],
    status: "open",
  }
}

const finalizeRound = async (round: LotteryRound, client = getPublicClient()): Promise<LotteryRound> => {
  const totalTickets = round.tickets.reduce((sum, entry) => sum + entry.count, 0)
  const potFromTicketsRaw = round.tickets.reduce((sum, entry) => {
    if (entry.usdcValueRaw) {
      return sum + BigInt(entry.usdcValueRaw)
    }
    return sum + BigInt(round.ticketUsdcRaw || "0") * BigInt(entry.count)
  }, 0n)
  const treasuryUsdcRaw = await getTreasuryUsdcRaw(client)
  const potInitialRaw = BigInt(round.potUsdcInitialRaw || "0")
  let potTotalRaw =
    potInitialRaw + potFromTicketsRaw > treasuryUsdcRaw ? treasuryUsdcRaw : potInitialRaw + potFromTicketsRaw

  let winners: LotteryWinner[] = []
  if (totalTickets === 0) {
    potTotalRaw = 0n
  } else if (potTotalRaw > 0n) {
    const winningTicket = Math.floor(Math.random() * totalTickets) + 1
    let cursor = 0
    let winnerAddress = round.tickets[0]?.address ?? ""
    for (const entry of round.tickets) {
      cursor += entry.count
      if (winningTicket <= cursor) {
        winnerAddress = entry.address
        break
      }
    }
    winners = [
      {
        address: winnerAddress,
        amountUsdcRaw: potTotalRaw.toString(),
        claimed: false,
        pickedAt: Date.now(),
        ticketIndex: winningTicket,
      },
    ]
  }

  return {
    ...round,
    totalTickets,
    potUsdcFromTicketsRaw: potFromTicketsRaw.toString(),
    potUsdcTotalRaw: potTotalRaw.toString(),
    winners,
    status: "closed",
  }
}

export const ensureCurrentLottery = async (): Promise<LotteryState> => {
  const client = getPublicClient()
  const state = loadLotteryState()

  if (!state.current) {
    state.current = await buildNewRound(client)
    saveLotteryState(state)
    return state
  }

  if (Date.now() >= state.current.endAt) {
    const closedRound = await finalizeRound(state.current, client)
    state.history = [closedRound, ...state.history].slice(0, 50)
    state.current = await buildNewRound(client)
    saveLotteryState(state)
    return state
  }

  return state
}

export const recalcRoundPot = async (round: LotteryRound, client = getPublicClient()) => {
  const totalTickets = round.tickets.reduce((sum, entry) => sum + entry.count, 0)
  const potFromTicketsRaw = round.tickets.reduce((sum, entry) => {
    if (entry.usdcValueRaw) {
      return sum + BigInt(entry.usdcValueRaw)
    }
    return sum + BigInt(round.ticketUsdcRaw || "0") * BigInt(entry.count)
  }, 0n)
  const treasuryUsdcRaw = await getTreasuryUsdcRaw(client)
  const potInitialRaw = BigInt(round.potUsdcInitialRaw || "0")
  const potTotalRaw = potInitialRaw + potFromTicketsRaw > treasuryUsdcRaw ? treasuryUsdcRaw : potInitialRaw + potFromTicketsRaw

  return {
    totalTickets,
    potUsdcFromTicketsRaw: potFromTicketsRaw.toString(),
    potUsdcTotalRaw: potTotalRaw.toString(),
  }
}

export const getUserTickets = (round: LotteryRound, address: string) => {
  const lowered = address.toLowerCase()
  return round.tickets.reduce((sum, entry) => (entry.address.toLowerCase() === lowered ? sum + entry.count : sum), 0)
}

export const getUserUnclaimedWinnings = (state: LotteryState, address: string) => {
  const lowered = address.toLowerCase()
  let totalRaw = 0n
  state.history.forEach((round) => {
    round.winners.forEach((winner) => {
      if (winner.address.toLowerCase() === lowered && !winner.claimed) {
        totalRaw += BigInt(winner.amountUsdcRaw)
      }
    })
  })
  return totalRaw
}

export const markWinningsClaimed = (state: LotteryState, address: string) => {
  const lowered = address.toLowerCase()
  state.history = state.history.map((round) => ({
    ...round,
    winners: round.winners.map((winner) =>
      winner.address.toLowerCase() === lowered ? { ...winner, claimed: true } : winner,
    ),
  }))
}

export const recordTicketPurchase = (round: LotteryRound, purchase: LotteryTicketPurchase) => {
  return {
    ...round,
    tickets: [...round.tickets, purchase],
  }
}

export const transferLogTopic = parseAbiItem("event Transfer(address indexed from, address indexed to, uint256 value)")
