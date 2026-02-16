"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { useToast } from "@/hooks/use-toast"
import { useBaseAuth } from "@/lib/base-auth"
import { BASE_MAINNET_CHAIN_ID } from "@/lib/base-config"
import { CONTRACTS, ERC20_ABI, BANDA_NFT_ABI, MINING_REWARD_ABI } from "@/lib/contracts"
import { BANDA_TIERS, getBandaTier, type BandaTier } from "@/lib/army-tiers"
import { useErc20Balance } from "@/lib/use-erc20-balance"
import { usePublicClient, useSendTransaction, useSwitchChain } from "wagmi"
import { encodeFunctionData, parseUnits } from "viem"
import { ConnectionDebug } from "@/components/connection-debug"
import { Loader2, Swords } from "lucide-react"

type BandaStatusResponse = {
  tier?: BandaTier
  ratePerSecond?: number
  ownedTokenIds?: number[]
  treasuryBalance?: string
  maxSeconds?: number
  lastClaimAt?: number
  error?: string
}

type BandaClaimResponse = {
  amount?: string
  amountRaw?: string
  tier?: BandaTier
  ratePerSecond?: number
  treasuryBalance?: string
  claim?: {
    contract?: `0x${string}`
    nonce?: string
    deadline?: number
    signature?: `0x${string}`
  }
  error?: string
}

type ConfettiPiece = {
  id: number
  left: number
  size: number
  delay: number
  duration: number
  rotate: number
  color: string
}

const USDC_DECIMALS = 6

export function ArmyScreen() {
  const { address, chainId, isAuthenticated, isConnecting, signIn } = useBaseAuth()
  const { toast } = useToast()
  const { sendTransactionAsync, isPending: isTxPending } = useSendTransaction()
  const { switchChainAsync, isPending: isSwitching } = useSwitchChain()
  const publicClient = usePublicClient({ chainId: BASE_MAINNET_CHAIN_ID })
  const bandaBalance = useErc20Balance({
    token: CONTRACTS.BANDA,
    address,
    chainId: BASE_MAINNET_CHAIN_ID,
    enabled: Boolean(address),
  })

  const [isClaiming, setIsClaiming] = useState(false)
  const [isUpgrading, setIsUpgrading] = useState(false)
  const [tier, setTier] = useState<BandaTier>("starter")
  const [ownedTokenIds, setOwnedTokenIds] = useState<number[]>([])
  const [ratePerSecond, setRatePerSecond] = useState(1)
  const [treasuryBalance, setTreasuryBalance] = useState("0")
  const [maxSeconds, setMaxSeconds] = useState<number | null>(null)
  const [lastClaimAt, setLastClaimAt] = useState<number | null>(null)
  const [now, setNow] = useState(Date.now())
  const [claimNotice, setClaimNotice] = useState<string | null>(null)
  const [confettiPieces, setConfettiPieces] = useState<ConfettiPiece[]>([])

  const tickerRef = useRef<NodeJS.Timeout | null>(null)
  const noticeTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const usdcAddress = process.env.NEXT_PUBLIC_USDC_ADDRESS as `0x${string}` | undefined
  const storageKey = address ? `rhino-lake:banda-claim:${address.toLowerCase()}` : null

  useEffect(() => {
    if (!address || !isAuthenticated) {
      setLastClaimAt(null)
      setRatePerSecond(1)
      setTier("starter")
      setTreasuryBalance("0")
      setOwnedTokenIds([])
      setMaxSeconds(null)
      return
    }

    const stored = typeof window !== "undefined" && storageKey ? window.localStorage.getItem(storageKey) : null
    const parsed = stored ? Number.parseInt(stored, 10) : NaN
    const nextLast = Number.isFinite(parsed) ? parsed : Date.now()
    setLastClaimAt(nextLast)
    if (typeof window !== "undefined" && storageKey && !stored) {
      window.localStorage.setItem(storageKey, nextLast.toString())
    }

    const loadStatus = async () => {
      try {
        const response = await fetch("/api/banda-status", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ address }),
        })
        const data = (await response.json()) as BandaStatusResponse
        if (!response.ok) {
          throw new Error(data?.error ?? "Unable to load Army status.")
        }
        setTier(data.tier ?? "starter")
        setRatePerSecond(data.ratePerSecond ?? 1)
        setOwnedTokenIds(data.ownedTokenIds ?? [])
        setTreasuryBalance(data.treasuryBalance ?? "0")
        setMaxSeconds(typeof data.maxSeconds === "number" ? data.maxSeconds : null)
        if (typeof data.lastClaimAt === "number" && Number.isFinite(data.lastClaimAt)) {
          setLastClaimAt(data.lastClaimAt)
          if (typeof window !== "undefined" && storageKey) {
            window.localStorage.setItem(storageKey, data.lastClaimAt.toString())
          }
        }
      } catch (error) {
        toast({
          title: "Army sync failed",
          description: error instanceof Error ? error.message : "Please try again.",
          variant: "destructive",
        })
      }
    }

    loadStatus()
  }, [address, isAuthenticated, storageKey, toast])

  useEffect(() => {
    if (tickerRef.current) {
      clearInterval(tickerRef.current)
    }
    tickerRef.current = setInterval(() => {
      setNow(Date.now())
    }, 1000)
    return () => {
      if (tickerRef.current) {
        clearInterval(tickerRef.current)
      }
    }
  }, [])

  const handleConnect = async () => {
    try {
      await signIn("coinbase")
    } catch {
      // errors handled by auth UI
    }
  }

  const ensureBaseNetwork = async () => {
    const activeChainId = chainId ?? BASE_MAINNET_CHAIN_ID
    if (activeChainId !== BASE_MAINNET_CHAIN_ID) {
      await switchChainAsync({ chainId: BASE_MAINNET_CHAIN_ID })
    }
    return BASE_MAINNET_CHAIN_ID
  }

  const ensureUsdcAllowance = async (amountRaw: bigint) => {
    if (!publicClient || !address || !usdcAddress || !CONTRACTS.BANDA_NFT) {
      throw new Error("USDC not configured.")
    }
    const allowance = (await publicClient.readContract({
      address: usdcAddress,
      abi: ERC20_ABI,
      functionName: "allowance",
      args: [address, CONTRACTS.BANDA_NFT as `0x${string}`],
    })) as bigint

    if (allowance >= amountRaw) {
      return
    }

    const approveHash = await sendTransactionAsync({
      chainId: BASE_MAINNET_CHAIN_ID,
      account: address,
      to: usdcAddress,
      data: encodeFunctionData({
        abi: ERC20_ABI,
        functionName: "approve",
        args: [CONTRACTS.BANDA_NFT as `0x${string}`, amountRaw],
      }),
    })
    await publicClient.waitForTransactionReceipt({ hash: approveHash })
  }

  const handleUpgrade = async (targetTier: BandaTier) => {
    if (!isAuthenticated || !address) {
      await handleConnect()
      return
    }

    const tierConfig = getBandaTier(targetTier)
    if (tierConfig.costUsdc <= 0) {
      return
    }

    if (!usdcAddress) {
      toast({
        title: "Upgrade unavailable",
        description: "USDC address is not configured.",
        variant: "destructive",
      })
      return
    }

    if (!CONTRACTS.BANDA_NFT) {
      toast({
        title: "Upgrade unavailable",
        description: "BANDA NFT contract not configured.",
        variant: "destructive",
      })
      return
    }

    setIsUpgrading(true)
    try {
      await ensureBaseNetwork()
      const priceRaw = parseUnits(tierConfig.costUsdc.toString(), USDC_DECIMALS)
      await ensureUsdcAllowance(priceRaw)

      const buyHash = await sendTransactionAsync({
        chainId: BASE_MAINNET_CHAIN_ID,
        account: address,
        to: CONTRACTS.BANDA_NFT as `0x${string}`,
        data: encodeFunctionData({
          abi: BANDA_NFT_ABI,
          functionName: "buy",
          args: [BigInt(tierConfig.tokenId)],
        }),
      })
      if (publicClient) {
        await publicClient.waitForTransactionReceipt({ hash: buyHash })
      }

      const response = await fetch("/api/banda-status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address }),
      })
      const data = (await response.json()) as BandaStatusResponse
      if (!response.ok) {
        throw new Error(data?.error ?? "Upgrade failed.")
      }

      setTier(data.tier ?? targetTier)
      setRatePerSecond(data.ratePerSecond ?? tierConfig.ratePerSecond)
      setOwnedTokenIds(data.ownedTokenIds ?? ownedTokenIds)
      setTreasuryBalance(data.treasuryBalance ?? treasuryBalance)
      setMaxSeconds(typeof data.maxSeconds === "number" ? data.maxSeconds : maxSeconds)
      toast({
        title: "Army upgraded",
        description: `${tierConfig.label} unlocked.`,
      })
    } catch (error) {
      toast({
        title: "Upgrade failed",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      })
    } finally {
      setIsUpgrading(false)
    }
  }

  const handleClaim = async () => {
    if (!isAuthenticated || !address) {
      await handleConnect()
      return
    }

    if (!lastClaimAt) {
      return
    }

    if (claimable <= 0) {
      toast({
        title: "Nothing to claim",
        description: "Let your army power accumulate first.",
      })
      return
    }

    setIsClaiming(true)
    try {
      const response = await fetch("/api/banda-claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address }),
      })
      const data = (await response.json()) as BandaClaimResponse
      if (!response.ok) {
        throw new Error(data?.error ?? "Claim failed.")
      }

      const claim = data.claim
      const claimContract = claim?.contract ?? (CONTRACTS.BANDA_MINING_REWARD as `0x${string}` | undefined)
      if (!claimContract) {
        throw new Error("Army rewards contract not configured.")
      }
      if (!claim?.signature || !claim?.nonce || !claim?.deadline || !data.amountRaw) {
        throw new Error("Missing claim authorization.")
      }

      await ensureBaseNetwork()
      const claimHash = await sendTransactionAsync({
        chainId: BASE_MAINNET_CHAIN_ID,
        account: address,
        to: claimContract,
        data: encodeFunctionData({
          abi: MINING_REWARD_ABI,
          functionName: "claim",
          args: [
            address,
            BigInt(data.amountRaw),
            BigInt(claim.nonce),
            BigInt(claim.deadline),
            claim.signature,
          ],
        }),
      })
      if (publicClient) {
        await publicClient.waitForTransactionReceipt({ hash: claimHash })
      }

      const nextLast = Date.now()
      setLastClaimAt(nextLast)
      if (typeof window !== "undefined" && storageKey) {
        window.localStorage.setItem(storageKey, nextLast.toString())
      }

      if (data.tier) {
        setTier(data.tier)
      }
      if (typeof data.ratePerSecond === "number") {
        setRatePerSecond(data.ratePerSecond)
      }
      if (data.treasuryBalance) {
        setTreasuryBalance(data.treasuryBalance)
      }

      if (noticeTimeoutRef.current) {
        clearTimeout(noticeTimeoutRef.current)
      }
      const claimedAmount = data.amount ?? 0
      setClaimNotice(`You claimed ${claimedAmount} $BANDA.`)
      setConfettiPieces(createConfettiPieces())
      noticeTimeoutRef.current = setTimeout(() => {
        setClaimNotice(null)
        setConfettiPieces([])
      }, 3200)
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

  useEffect(() => {
    return () => {
      if (noticeTimeoutRef.current) {
        clearTimeout(noticeTimeoutRef.current)
      }
    }
  }, [])

  const createConfettiPieces = () => {
    const colors = ["#fbbf24", "#f97316", "#34d399", "#60a5fa", "#f472b6", "#a78bfa"]
    return Array.from({ length: 28 }, (_, index) => ({
      id: index,
      left: Math.random() * 100,
      size: 6 + Math.random() * 8,
      delay: Math.random() * 0.2,
      duration: 1.6 + Math.random() * 0.8,
      rotate: Math.random() * 360,
      color: colors[index % colors.length],
    }))
  }

  const isActionLoading = isConnecting || isSwitching || isTxPending
  const currentTier = useMemo(() => getBandaTier(tier), [tier])
  const bandaConfigured = Boolean(CONTRACTS.BANDA_NFT)
  const rewardConfigured = Boolean(CONTRACTS.BANDA_MINING_REWARD)
  const treasuryBalanceNumber = Number(treasuryBalance)
  const treasuryBalanceDisplay = Number.isFinite(treasuryBalanceNumber)
    ? treasuryBalanceNumber.toLocaleString(undefined, { maximumFractionDigits: 4 })
    : treasuryBalance
  const bandaBalanceNumber = Number(bandaBalance.formatted)
  const bandaBalanceDisplay = Number.isFinite(bandaBalanceNumber)
    ? bandaBalanceNumber.toLocaleString(undefined, { maximumFractionDigits: 4 })
    : bandaBalance.formatted
  const elapsedSeconds = lastClaimAt ? Math.max(Math.floor((now - lastClaimAt) / 1000), 0) : 0
  const cappedSeconds = maxSeconds !== null ? Math.min(elapsedSeconds, maxSeconds) : elapsedSeconds
  const accrued = cappedSeconds * ratePerSecond
  const claimable = Math.max(accrued, 0)

  return (
    <div className="flex-1 relative overflow-hidden">
      {claimNotice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none">
          <div className="pointer-events-none rounded-xl border border-primary/30 bg-background/95 px-6 py-4 text-center text-sm font-semibold text-foreground shadow-xl">
            {claimNotice}
          </div>
          <div className="absolute inset-0 overflow-hidden pointer-events-none">
            {confettiPieces.map((piece) => (
              <span
                key={piece.id}
                className="absolute top-1/2"
                style={
                  {
                    left: `${piece.left}%`,
                    width: `${piece.size}px`,
                    height: `${piece.size * 0.45}px`,
                    backgroundColor: piece.color,
                    animationDelay: `${piece.delay}s`,
                    animationDuration: `${piece.duration}s`,
                    transform: `translateY(-20px) rotate(${piece.rotate}deg)`,
                    borderRadius: "2px",
                    "--confetti-rot": `${piece.rotate}deg`,
                  } as React.CSSProperties
                }
              />
            ))}
          </div>
          <style jsx>{`
            span {
              animation-name: confetti-fall;
              animation-timing-function: ease-out;
              animation-fill-mode: forwards;
            }
            @keyframes confetti-fall {
              0% {
                opacity: 1;
                transform: translateY(-20px) rotate(var(--confetti-rot));
              }
              100% {
                opacity: 0;
                transform: translateY(60vh) rotate(calc(var(--confetti-rot) + 120deg));
              }
            }
          `}</style>
        </div>
      )}
      <div
        className="absolute inset-0 bg-center bg-cover"
        style={{ backgroundImage: "url(/ZenTemple.png)" }}
      />
      <div className="absolute inset-0 bg-black/40" />

      <div className="relative z-10 mx-auto w-full max-w-3xl px-4 py-10 space-y-6">
        <Card className="game-card p-6 space-y-2 bg-card/70 backdrop-blur border-border/60">
          <div className="flex items-center gap-2 text-lg font-semibold text-foreground">
            <Swords className="h-5 w-5 text-primary" />
            Army Command
          </div>
          <p className="text-sm text-muted-foreground">
            Your $BANDA army power grows passively, even while you are away.
          </p>
        </Card>

        <div className="grid gap-4 sm:grid-cols-3">
          <Card className="game-card p-4 space-y-1 bg-card/70 backdrop-blur border-border/60">
            <p className="text-xs text-muted-foreground">Current Rate</p>
            <p className="text-xl font-bold text-primary">{ratePerSecond} $BANDA / sec</p>
            <p className="text-[11px] text-muted-foreground">
              Non-locked Army Power: {bandaBalanceDisplay} $BANDA
            </p>
            <p className="text-[11px] text-muted-foreground">{currentTier.label}</p>
          </Card>
          <Card className="game-card p-4 space-y-1 bg-card/70 backdrop-blur border-border/60">
            <p className="text-xs text-muted-foreground">Claimable Army Power</p>
            <p className="text-xl font-bold text-foreground">{claimable.toLocaleString()} $BANDA</p>
            <p className="text-[11px] text-muted-foreground">Only accumilated while on this page</p>
          </Card>
          <Card className="game-card p-4 space-y-1 bg-card/70 backdrop-blur border-border/60">
            <p className="text-xs text-muted-foreground">Currently mineable</p>
            <p className="text-xl font-bold text-foreground">{treasuryBalanceDisplay} $BANDA</p>
            <p className="text-[11px] text-muted-foreground">Treasury balance</p>
          </Card>
        </div>

        <Card className="game-card p-6 space-y-4 bg-card/70 backdrop-blur border-border/60">
          <div className="space-y-1 text-center">
            <h3 className="text-lg font-semibold text-foreground">Claim Army Power</h3>
            <p className="text-xs text-muted-foreground">Claim your accumulated $BANDA to your wallet.</p>
          </div>
          <Button
            onClick={handleClaim}
            disabled={!isAuthenticated || !rewardConfigured || isActionLoading || isClaiming || claimable <= 0}
            className="w-full h-11 text-base font-semibold"
          >
            {isClaiming ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Claiming...
              </>
            ) : (
              `Claim ${claimable.toLocaleString()} $BANDA`
            )}
          </Button>
        </Card>

        <Card className="game-card p-6 space-y-4 bg-card/70 backdrop-blur border-border/60">
          <div className="space-y-1 text-center">
            <h3 className="text-lg font-semibold text-foreground">Army Boosters</h3>
            <p className="text-xs text-muted-foreground">Unlock faster passive $BANDA gains.</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {BANDA_TIERS.filter((entry) => entry.id !== "starter").map((entry) => {
              const owned = ownedTokenIds.includes(entry.tokenId)
              return (
                <div key={entry.id} className="rounded-lg border border-border bg-muted/30 p-4 space-y-3">
                  <div className="flex items-center gap-3">
                    {entry.image && (
                      <img src={entry.image} alt={entry.label} className="h-16 w-16 rounded-md object-contain" />
                    )}
                    <div>
                      <p className="text-sm font-semibold text-foreground">{entry.label}</p>
                      <p className="text-xs text-muted-foreground">
                        {entry.costUsdc} USDC • {entry.ratePerSecond} / sec
                      </p>
                    </div>
                  </div>
                  <Button
                    onClick={() => handleUpgrade(entry.id)}
                    disabled={owned || isUpgrading || isActionLoading || !isAuthenticated || !bandaConfigured}
                    className="w-full"
                    variant={owned ? "secondary" : "default"}
                  >
                    {owned ? "Owned" : `Buy for ${entry.costUsdc} USDC`}
                  </Button>
                </div>
              )
            })}
          </div>
        </Card>

        <ConnectionDebug />
      </div>
    </div>
  )
}
