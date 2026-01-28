"use client"

import { useEffect, useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { useToast } from "@/hooks/use-toast"
import { useBaseAuth } from "@/lib/base-auth"
import { BASE_MAINNET_CHAIN_ID } from "@/lib/base-config"
import { CONTRACTS, ERC20_ABI } from "@/lib/contracts"
import { BandaSwapPanel } from "@/components/banda-swap-panel"
import { Loader2, Ticket, Trophy } from "lucide-react"
import { encodeFunctionData, formatUnits } from "viem"
import { usePublicClient, useSendTransaction, useSwitchChain } from "wagmi"

type LotteryStatusResponse = {
  current?: {
    id: string
    startAt: number
    endAt: number
    ticketPriceBandaRaw: string
    ticketPriceBanda: string
    ticketUsdcRaw: string
    ticketUsdcApprox: string
    totalTickets: number
    potUsdcInitial: string
    potUsdcFromTickets: string
    potUsdcTotal: string
    status: "open" | "closed"
  }
  user?: {
    tickets: number
    remainingTickets: number
    maxTickets: number
    unclaimedWinnings: string
    hasUnclaimedWinnings: boolean
  }
  treasuryAddress?: string
  history?: Array<{
    id: string
    startAt: number
    endAt: number
    totalTickets: number
    potUsdcTotal: string
    winners: Array<{ address: string; amountUsdc: string; claimed: boolean }>
  }>
  bandaDecimals?: number
  error?: string
}

export function LotteryScreen() {
  const { address, chainId, isAuthenticated, isConnecting, signIn } = useBaseAuth()
  const { toast } = useToast()
  const publicClient = usePublicClient({ chainId: BASE_MAINNET_CHAIN_ID })
  const { sendTransactionAsync, isPending: isTxPending } = useSendTransaction()
  const { switchChainAsync, isPending: isSwitching } = useSwitchChain()
  const usdcAddress = process.env.NEXT_PUBLIC_USDC_ADDRESS as `0x${string}` | undefined

  const [status, setStatus] = useState<LotteryStatusResponse | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isBuying, setIsBuying] = useState(false)
  const [isClaiming, setIsClaiming] = useState(false)
  const [ticketCount, setTicketCount] = useState(1)
  const [showHistory, setShowHistory] = useState(false)
  const [now, setNow] = useState(Date.now())
  const [paymentMethod, setPaymentMethod] = useState<"banda" | "usdc">("banda")

  const refreshStatus = async () => {
    setIsLoading(true)
    try {
      const response = await fetch("/api/lottery-status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address }),
      })
      const data = (await response.json()) as LotteryStatusResponse
      if (!response.ok) {
        throw new Error(data?.error ?? "Unable to load lottery.")
      }
      setStatus(data)
    } catch (error) {
      toast({
        title: "Lottery sync failed",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      })
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    refreshStatus()
  }, [address])

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30000)
    return () => clearInterval(timer)
  }, [])

  const handleConnect = async () => {
    try {
      await signIn("coinbase")
    } catch {
      // handled by auth UI
    }
  }

  const ensureBaseNetwork = async () => {
    const activeChainId = chainId ?? BASE_MAINNET_CHAIN_ID
    if (activeChainId !== BASE_MAINNET_CHAIN_ID) {
      await switchChainAsync({ chainId: BASE_MAINNET_CHAIN_ID })
      throw new Error("Switching to Base mainnet. Please try again.")
    }
    return BASE_MAINNET_CHAIN_ID
  }

  const handleBuyTickets = async () => {
    if (!isAuthenticated || !address) {
      await handleConnect()
      return
    }

    if (!status?.current || !status.treasuryAddress) {
      toast({
        title: "Lottery unavailable",
        description: "Ticket pricing is loading. Try again soon.",
        variant: "destructive",
      })
      return
    }

    const maxRemaining = status.user?.remainingTickets ?? 0
    if (ticketCount <= 0 || ticketCount > maxRemaining) {
      toast({
        title: "Invalid ticket count",
        description: `You can buy up to ${maxRemaining} more tickets.`,
        variant: "destructive",
      })
      return
    }

    if (paymentMethod === "usdc" && !usdcAddress) {
      toast({
        title: "USDC unavailable",
        description: "USDC address is not configured.",
        variant: "destructive",
      })
      return
    }

    const ticketPriceRaw =
      paymentMethod === "usdc"
        ? BigInt(status.current.ticketUsdcRaw || "0")
        : BigInt(status.current.ticketPriceBandaRaw || "0")
    if (ticketPriceRaw <= 0n) {
      toast({
        title: "Pricing unavailable",
        description: "Ticket price could not be calculated yet.",
        variant: "destructive",
      })
      return
    }

    const totalCostRaw = ticketPriceRaw * BigInt(ticketCount)
    const costDecimals = paymentMethod === "usdc" ? 6 : status.bandaDecimals ?? 18
    const totalCostDisplay = formatUnits(totalCostRaw, costDecimals)

    setIsBuying(true)
    try {
      await ensureBaseNetwork()

      const txHash = await sendTransactionAsync({
        chainId: BASE_MAINNET_CHAIN_ID,
        account: address,
        to: paymentMethod === "usdc" ? usdcAddress : CONTRACTS.BANDA,
        data: encodeFunctionData({
          abi: ERC20_ABI,
          functionName: "transfer",
          args: [status.treasuryAddress as `0x${string}`, totalCostRaw],
        }),
      })

      if (publicClient) {
        await publicClient.waitForTransactionReceipt({ hash: txHash })
      }

      const response = await fetch("/api/lottery-buy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address, count: ticketCount, txHash, paymentToken: paymentMethod }),
      })
      const data = (await response.json()) as { error?: string }
      if (!response.ok) {
        throw new Error(data?.error ?? "Ticket purchase failed.")
      }

      toast({
        title: "Tickets purchased",
        description: `Bought ${ticketCount} ticket(s) for ${Number(totalCostDisplay).toFixed(paymentMethod === "usdc" ? 2 : 4)} ${paymentMethod === "usdc" ? "USDC" : "$BANDA"}.`,
      })
      setTicketCount(1)
      await refreshStatus()
    } catch (error) {
      toast({
        title: "Purchase failed",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      })
    } finally {
      setIsBuying(false)
    }
  }

  const handleClaimWinnings = async () => {
    if (!isAuthenticated || !address) {
      await handleConnect()
      return
    }

    setIsClaiming(true)
    try {
      const response = await fetch("/api/lottery-claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address }),
      })
      const data = (await response.json()) as { amount?: string; error?: string }
      if (!response.ok) {
        throw new Error(data?.error ?? "Claim failed.")
      }
      toast({
        title: "Winnings claimed",
        description: `Claimed ${data.amount ?? "0"} USDC.`,
      })
      await refreshStatus()
    } catch (error) {
      toast({
        title: "Claim failed",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      })
    } finally {
      setIsClaiming(false)
    }
  }

  const endAt = status?.current?.endAt ?? now
  const timeRemaining = Math.max(endAt - now, 0)
  const hoursRemaining = Math.floor(timeRemaining / (1000 * 60 * 60))
  const minutesRemaining = Math.floor((timeRemaining % (1000 * 60 * 60)) / (1000 * 60))

  const isActionLoading = isConnecting || isSwitching || isTxPending
  const canBuy =
    (status?.user?.remainingTickets ?? 0) > 0 &&
    status?.current?.status === "open" &&
    (paymentMethod !== "usdc" || Boolean(usdcAddress))
  const ticketPriceBanda = useMemo(() => {
    if (!status?.current?.ticketPriceBandaRaw) return "--"
    const decimals = BigInt(status.bandaDecimals ?? 18)
    const divisor = 10n ** decimals
    const raw = BigInt(status.current.ticketPriceBandaRaw)
    const rounded = (raw + divisor / 2n) / divisor
    return rounded.toString()
  }, [status?.bandaDecimals, status?.current?.ticketPriceBandaRaw])

  const ticketPriceUsdc = useMemo(() => {
    if (!status?.current?.ticketUsdcRaw) return "--"
    const raw = BigInt(status.current.ticketUsdcRaw)
    return Number(formatUnits(raw, 6)).toFixed(2)
  }, [status?.current?.ticketUsdcRaw])
  const potTotal = status?.current?.potUsdcTotal ?? "--"
  const totalTickets = status?.current?.totalTickets ?? 0
  const userTickets = status?.user?.tickets ?? 0
  const hasWinnings = status?.user?.hasUnclaimedWinnings ?? false

  const remainingTicketsLabel =
    status?.user?.remainingTickets !== undefined
      ? `${status.user.remainingTickets} / ${status.user.maxTickets}`
      : "--"
  const maxRemainingTickets = status?.user?.remainingTickets ?? 1

  const displayTicketCount = Number.isFinite(ticketCount) ? ticketCount : 1

  const ticketCostDisplay = useMemo(() => {
    if (!status?.current?.ticketPriceBandaRaw || !status?.current?.ticketUsdcRaw) return "--"
    if (paymentMethod === "usdc") {
      const raw = BigInt(status.current.ticketUsdcRaw) * BigInt(displayTicketCount)
      return Number(formatUnits(raw, 6)).toFixed(2)
    }
    const decimals = BigInt(status.bandaDecimals ?? 18)
    const divisor = 10n ** decimals
    const raw = BigInt(status.current.ticketPriceBandaRaw) * BigInt(displayTicketCount)
    const rounded = (raw + divisor / 2n) / divisor
    return rounded.toString()
  }, [
    displayTicketCount,
    paymentMethod,
    status?.bandaDecimals,
    status?.current?.ticketPriceBandaRaw,
    status?.current?.ticketUsdcRaw,
  ])

  return (
    <div className="flex-1 relative overflow-hidden">
      <div
        className="absolute inset-0 bg-center bg-cover"
        style={{ backgroundImage: "url(/lotterycat.png)" }}
      />
      <div className="absolute inset-0 bg-black/50" />

      <div className="relative z-10 mx-auto w-full max-w-3xl px-4 py-10 space-y-6">
        <Card className="game-card p-6 space-y-3 bg-card/80 backdrop-blur border-border/60">
          <div className="flex items-center gap-2 text-lg font-semibold text-foreground">
            <Ticket className="h-5 w-5 text-primary" />
            Weekly $BANDA Lottery
          </div>
          <p className="text-sm text-muted-foreground">
            Buy tickets with $BANDA for a chance to win the USDC pot. Each round lasts one week.
          </p>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-lg border border-border/60 bg-muted/30 p-3 text-center">
              <p className="text-xs text-muted-foreground">Current Pot (USDC)</p>
              <p className="text-xl font-bold text-foreground">{potTotal}</p>
            </div>
            <div className="rounded-lg border border-border/60 bg-muted/30 p-3 text-center">
              <p className="text-xs text-muted-foreground">Tickets Sold</p>
              <p className="text-xl font-bold text-foreground">{totalTickets}</p>
            </div>
            <div className="rounded-lg border border-border/60 bg-muted/30 p-3 text-center">
              <p className="text-xs text-muted-foreground">Time Left</p>
              <p className="text-xl font-bold text-foreground">
                {hoursRemaining}h {minutesRemaining}m
              </p>
            </div>
          </div>
        </Card>

        <Card className="game-card p-6 space-y-4 bg-card/80 backdrop-blur border-border/60">
          <div className="space-y-1 text-center">
            <h3 className="text-lg font-semibold text-foreground">Buy Tickets</h3>
            <p className="text-xs text-muted-foreground">
              Ticket price: {ticketPriceBanda} $BANDA (no fee) or {ticketPriceUsdc} USDC (includes $0.10 fee).
            </p>
          </div>
          <div className="flex items-center justify-center gap-2">
            <Button
              type="button"
              size="sm"
              variant={paymentMethod === "banda" ? "default" : "outline"}
              onClick={() => setPaymentMethod("banda")}
            >
              Pay with $BANDA (10% discounted!)
            </Button>
            <Button
              type="button"
              size="sm"
              variant={paymentMethod === "usdc" ? "default" : "outline"}
              onClick={() => setPaymentMethod("usdc")}
            >
              Pay with USDC
            </Button>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <label className="text-xs font-semibold text-muted-foreground">Ticket Count</label>
              <Input
                type="number"
                min="1"
                max={maxRemainingTickets}
                value={ticketCount}
                onChange={(event) => {
                  const nextValue = Number(event.target.value)
                  if (!Number.isFinite(nextValue)) {
                    setTicketCount(1)
                    return
                  }
                  const clamped = Math.max(1, Math.min(maxRemainingTickets || 1, Math.floor(nextValue)))
                  setTicketCount(clamped)
                }}
                className="h-11"
              />
              <p className="text-xs text-muted-foreground">Remaining: {remainingTicketsLabel}</p>
              <p className="text-xs text-muted-foreground">Your tickets: {userTickets}</p>
            </div>
            <div className="rounded-lg border border-border/60 bg-muted/30 p-3 text-center space-y-1">
              <p className="text-xs text-muted-foreground">Total Cost</p>
              <p className="text-2xl font-bold text-foreground">
                {ticketCostDisplay} {paymentMethod === "usdc" ? "USDC" : "$BANDA"}
              </p>
              <p className="text-[11px] text-muted-foreground">Paid from your wallet</p>
            </div>
          </div>
          <Button
            onClick={handleBuyTickets}
            disabled={!canBuy || isBuying || isActionLoading || isLoading}
            className="w-full h-12 text-base font-semibold"
          >
            {isBuying ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Buying Tickets...
              </>
            ) : (
              `Buy ${displayTicketCount} Ticket${displayTicketCount === 1 ? "" : "s"}`
            )}
          </Button>
        </Card>

        <BandaSwapPanel title="Need $BANDA?" subtitle="Swap USDC into $BANDA before buying tickets." />

        <Card className="game-card p-6 space-y-4 bg-card/80 backdrop-blur border-border/60">
          <div className="space-y-1 text-center">
            <h3 className="text-lg font-semibold text-foreground">Claim Winnings</h3>
            <p className="text-xs text-muted-foreground">Winnings are paid out in USDC.</p>
          </div>
          <Button
            onClick={handleClaimWinnings}
            disabled={!hasWinnings || isClaiming || isActionLoading}
            className="w-full h-12 text-base font-semibold"
            variant="outline"
          >
            {isClaiming ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Claiming...
              </>
            ) : hasWinnings ? (
              `Claim ${status?.user?.unclaimedWinnings ?? "0"} USDC`
            ) : (
              "No Winnings Yet"
            )}
          </Button>
        </Card>

        <Card className="game-card p-6 space-y-4 bg-card/80 backdrop-blur border-border/60">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <h3 className="text-lg font-semibold text-foreground">Past Results</h3>
              <p className="text-xs text-muted-foreground">View recent lottery winners and pots.</p>
            </div>
            <Button variant="outline" size="sm" onClick={() => setShowHistory((prev) => !prev)}>
              {showHistory ? "Hide" : "View"}
            </Button>
          </div>
          {showHistory && (
            <div className="space-y-3">
              {(status?.history ?? []).length === 0 && (
                <p className="text-xs text-muted-foreground">No results yet.</p>
              )}
              {(status?.history ?? []).map((round) => (
                <div key={round.id} className="rounded-lg border border-border/60 bg-muted/30 p-3 space-y-2">
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>Round {round.id}</span>
                    <span>Total Pot: {round.potUsdcTotal} USDC</span>
                  </div>
                  {round.winners.length === 0 ? (
                    <p className="text-xs text-muted-foreground">No tickets purchased.</p>
                  ) : (
                    round.winners.map((winner) => (
                      <div key={winner.address} className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2 text-foreground">
                          <Trophy className="h-4 w-4 text-primary" />
                          <span>{winner.address.slice(0, 6)}...{winner.address.slice(-4)}</span>
                        </div>
                        <span className="text-muted-foreground">{winner.amountUsdc} USDC</span>
                      </div>
                    ))
                  )}
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  )
}
