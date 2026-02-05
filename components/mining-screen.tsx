"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { useToast } from "@/hooks/use-toast"
import { useBaseAuth } from "@/lib/base-auth"
import { BASE_MAINNET_CHAIN_ID } from "@/lib/base-config"
import { CONTRACTS, ERC20_ABI, MINING_REWARD_ABI, PICKAXE_NFT_ABI } from "@/lib/contracts"
import { PICKAXE_TIERS, getPickaxeTier, type PickaxeTier } from "@/lib/mining-tiers"
import { Loader2, Pickaxe } from "lucide-react"
import { usePublicClient, useSendTransaction, useSwitchChain } from "wagmi"
import { encodeFunctionData, parseUnits } from "viem"

type MiningStatusResponse = {
  count?: number
  tier?: PickaxeTier
  rewardPerClick?: number
  maxClicks?: number
  treasuryBalance?: string
  ownedTokenIds?: number[]
  error?: string
}

type MiningClaimResponse = {
  clicks?: number
  amount?: string
  amountRaw?: string
  tier?: PickaxeTier
  rewardPerClick?: number
  treasuryBalance?: string
  maxClicks?: number
  claim?: {
    contract?: `0x${string}`
    nonce?: string
    deadline?: number
    signature?: `0x${string}`
  }
  error?: string
}

const USDC_DECIMALS = 6

type ConfettiPiece = {
  id: number
  left: number
  size: number
  delay: number
  duration: number
  rotate: number
  color: string
}

export function MiningScreen() {
  const { address, chainId, isAuthenticated, isConnecting, signIn } = useBaseAuth()
  const { toast } = useToast()
  const { sendTransactionAsync, isPending: isTxPending } = useSendTransaction()
  const { switchChainAsync, isPending: isSwitching } = useSwitchChain()
  const publicClient = usePublicClient({ chainId: BASE_MAINNET_CHAIN_ID })
  const [serverClicks, setServerClicks] = useState(0)
  const [pendingClicks, setPendingClicks] = useState(0)
  const [isMining, setIsMining] = useState(false)
  const [isClaiming, setIsClaiming] = useState(false)
  const [isUpgrading, setIsUpgrading] = useState(false)
  const [treasuryBalance, setTreasuryBalance] = useState("0")
  const [maxClicks, setMaxClicks] = useState<number | null>(null)
  const [rewardPerClick, setRewardPerClick] = useState(1)
  const [tier, setTier] = useState<PickaxeTier>("starter")
  const [ownedTokenIds, setOwnedTokenIds] = useState<number[]>([])
  const [claimNotice, setClaimNotice] = useState<string | null>(null)
  const [confettiPieces, setConfettiPieces] = useState<ConfettiPiece[]>([])
  const noticeTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const miningTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const flushTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const isFlushingRef = useRef(false)
  const flushPromiseRef = useRef<Promise<void> | null>(null)
  const pendingClicksRef = useRef(0)

  const usdcAddress = process.env.NEXT_PUBLIC_USDC_ADDRESS as `0x${string}` | undefined

  useEffect(() => {
    if (!address || !isAuthenticated) {
      setServerClicks(0)
      setPendingClicks(0)
      pendingClicksRef.current = 0
      setMaxClicks(null)
      setRewardPerClick(1)
      setTier("starter")
      setTreasuryBalance("0")
      setOwnedTokenIds([])
      return
    }

    const loadStatus = async () => {
      try {
        const response = await fetch("/api/mining-status", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ address }),
        })
        const data = (await response.json()) as MiningStatusResponse
        if (!response.ok) {
          throw new Error(data?.error ?? "Unable to load mining count.")
        }
        setServerClicks(data.count ?? 0)
        setPendingClicks(0)
        pendingClicksRef.current = 0
        setMaxClicks(typeof data.maxClicks === "number" ? data.maxClicks : null)
        setRewardPerClick(data.rewardPerClick ?? 1)
        setTier(data.tier ?? "starter")
        setTreasuryBalance(data.treasuryBalance ?? "0")
        setOwnedTokenIds(data.ownedTokenIds ?? [])
      } catch (error) {
        setServerClicks(0)
        setPendingClicks(0)
        pendingClicksRef.current = 0
        toast({
          title: "Mining sync failed",
          description: error instanceof Error ? error.message : "Please try again.",
          variant: "destructive",
        })
      }
    }

    loadStatus()
  }, [address, isAuthenticated, toast])

  useEffect(() => {
    if (!address || maxClicks === null) return
    const display = serverClicks + pendingClicks
    if (display > maxClicks) {
      const overflow = display - maxClicks
      const nextPending = Math.max(pendingClicks - overflow, 0)
      setPendingClicks(nextPending)
      pendingClicksRef.current = nextPending
    }
  }, [address, maxClicks, pendingClicks, serverClicks])

  const handleConnect = async () => {
    try {
      await signIn("coinbase")
    } catch {
      // auth errors handled by global UI
    }
  }

  const flushPendingClicks = async (force = false) => {
    if (!address || !isAuthenticated) return
    if (pendingClicksRef.current <= 0) return
    if (isFlushingRef.current) {
      if (flushPromiseRef.current) {
        await flushPromiseRef.current
      }
      return
    }
    isFlushingRef.current = true
    const run = (async () => {
      while (pendingClicksRef.current > 0) {
        const batch = Math.min(pendingClicksRef.current, 12)
        const response = await fetch("/api/mining-click", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ address, count: batch }),
        })
        const data = (await response.json()) as {
          count?: number
          maxClicks?: number
          rewardPerClick?: number
          tier?: PickaxeTier
          accepted?: number
          error?: string
        }
        if (!response.ok) {
          throw new Error(data?.error ?? "Mining failed.")
        }
        const accepted = typeof data.accepted === "number" ? data.accepted : batch
        const nextPending = Math.max(pendingClicksRef.current - accepted, 0)
        pendingClicksRef.current = nextPending
        setPendingClicks(nextPending)
        if (typeof data.count === "number") {
          setServerClicks(data.count)
        }
        if (typeof data.maxClicks === "number") {
          setMaxClicks(data.maxClicks)
        }
        if (typeof data.rewardPerClick === "number") {
          setRewardPerClick(data.rewardPerClick)
        }
        if (data.tier) {
          setTier(data.tier)
        }
        if (accepted < batch && pendingClicksRef.current > 0) {
          if (flushTimeoutRef.current) {
            clearTimeout(flushTimeoutRef.current)
          }
          flushTimeoutRef.current = setTimeout(() => {
            flushPendingClicks().catch(() => null)
          }, 700)
        }

        if (!force || accepted < batch) {
          break
        }
      }
    })()
    flushPromiseRef.current = run
    try {
      await run
    } catch (error) {
      const message = error instanceof Error ? error.message : "Mining request failed."
      if (!force && message.toLowerCase().includes("too fast")) {
        if (flushTimeoutRef.current) {
          clearTimeout(flushTimeoutRef.current)
        }
        flushTimeoutRef.current = setTimeout(() => {
          flushPendingClicks().catch(() => null)
        }, 700)
        return
      }
      toast({
        title: "Mining paused",
        description: message,
        variant: "destructive",
      })
    } finally {
      flushPromiseRef.current = null
      isFlushingRef.current = false
    }
  }

  const handleMineClick = async () => {
    if (!isAuthenticated || !address) {
      await handleConnect()
      return
    }

    const displayClicks = serverClicks + pendingClicks
    if (maxClicks !== null && displayClicks >= maxClicks) {
      toast({
        title: "Mining paused",
        description: "Treasury is empty right now. Try again later.",
        variant: "destructive",
      })
      return
    }

    const nextPending = pendingClicksRef.current + 1
    pendingClicksRef.current = nextPending
    setPendingClicks(nextPending)
    setIsMining(true)
    if (miningTimeoutRef.current) {
      clearTimeout(miningTimeoutRef.current)
    }
    miningTimeoutRef.current = setTimeout(() => {
      setIsMining(false)
    }, 180)

    if (flushTimeoutRef.current) {
      clearTimeout(flushTimeoutRef.current)
    }
    flushTimeoutRef.current = setTimeout(() => {
      flushPendingClicks().catch(() => null)
    }, 250)
  }

  const handleClaim = async () => {
    if (!isAuthenticated || !address) {
      await handleConnect()
      return
    }

    const displayClicks = serverClicks + pendingClicks
    if (displayClicks <= 0) {
      toast({
        title: "Nothing to claim",
        description: "Mine some clicks first.",
      })
      return
    }

    setIsClaiming(true)
    try {
      if (flushTimeoutRef.current) {
        clearTimeout(flushTimeoutRef.current)
      }
      if (isFlushingRef.current && flushPromiseRef.current) {
        await flushPromiseRef.current
      }
      await flushPendingClicks(true)
      const response = await fetch("/api/mining-claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address }),
      })
      const data = (await response.json()) as MiningClaimResponse
      if (!response.ok) {
        throw new Error(data?.error ?? "Claim failed.")
      }

      const claim = data.claim
      const claimContract = claim?.contract ?? (CONTRACTS.BAR_MINING_REWARD as `0x${string}` | undefined)
      if (!claimContract) {
        throw new Error("Mining rewards contract not configured.")
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

      setServerClicks(0)
      setPendingClicks(0)
      pendingClicksRef.current = 0
      if (data.rewardPerClick) {
        setRewardPerClick(data.rewardPerClick)
      }
      if (data.tier) {
        setTier(data.tier)
      }
      if (data.treasuryBalance) {
        setTreasuryBalance(data.treasuryBalance)
      }
      if (typeof data.maxClicks === "number") {
        setMaxClicks(data.maxClicks)
      }
      if (noticeTimeoutRef.current) {
        clearTimeout(noticeTimeoutRef.current)
      }
      const claimedAmount = data.amount ?? data.clicks ?? 0
      setClaimNotice(`You claimed ${claimedAmount} BAR.`)
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

  const ensureBaseNetwork = async () => {
    const activeChainId = chainId ?? BASE_MAINNET_CHAIN_ID
    if (activeChainId !== BASE_MAINNET_CHAIN_ID) {
      await switchChainAsync({ chainId: BASE_MAINNET_CHAIN_ID })
    }
    return BASE_MAINNET_CHAIN_ID
  }

  const ensureUsdcAllowance = async (amountRaw: bigint) => {
    if (!publicClient || !address || !usdcAddress || !CONTRACTS.PICKAXE_NFT) {
      throw new Error("USDC not configured.")
    }
    const allowance = (await publicClient.readContract({
      address: usdcAddress,
      abi: ERC20_ABI,
      functionName: "allowance",
      args: [address, CONTRACTS.PICKAXE_NFT as `0x${string}`],
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
        args: [CONTRACTS.PICKAXE_NFT as `0x${string}`, amountRaw],
      }),
    })
    await publicClient.waitForTransactionReceipt({ hash: approveHash })
  }

  const handleUpgrade = async (targetTier: PickaxeTier) => {
    if (!isAuthenticated || !address) {
      await handleConnect()
      return
    }

    const tierConfig = getPickaxeTier(targetTier)
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

    if (!CONTRACTS.PICKAXE_NFT) {
      toast({
        title: "Upgrade unavailable",
        description: "Pickaxe contract not configured.",
        variant: "destructive",
      })
      return
    }

    if (tier === targetTier) {
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
        to: CONTRACTS.PICKAXE_NFT as `0x${string}`,
        data: encodeFunctionData({
          abi: PICKAXE_NFT_ABI,
          functionName: "buy",
          args: [BigInt(tierConfig.tokenId)],
        }),
      })
      if (publicClient) {
        await publicClient.waitForTransactionReceipt({ hash: buyHash })
      }

      const response = await fetch("/api/mining-status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address }),
      })
      const data = (await response.json()) as MiningStatusResponse
      if (!response.ok) {
        throw new Error(data?.error ?? "Upgrade failed.")
      }

      setTier(data.tier ?? targetTier)
      setRewardPerClick(data.rewardPerClick ?? tierConfig.rewardPerClick)
      setTreasuryBalance(data.treasuryBalance ?? treasuryBalance)
      setOwnedTokenIds(data.ownedTokenIds ?? ownedTokenIds)
      setMaxClicks(typeof data.maxClicks === "number" ? data.maxClicks : maxClicks)
      toast({
        title: "Pickaxe upgraded",
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

  useEffect(() => {
    return () => {
      if (noticeTimeoutRef.current) {
        clearTimeout(noticeTimeoutRef.current)
      }
      if (miningTimeoutRef.current) {
        clearTimeout(miningTimeoutRef.current)
      }
      if (flushTimeoutRef.current) {
        clearTimeout(flushTimeoutRef.current)
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
  const currentTier = useMemo(() => getPickaxeTier(tier), [tier])
  const pickaxeConfigured = Boolean(CONTRACTS.PICKAXE_NFT)
  const rewardConfigured = Boolean(CONTRACTS.BAR_MINING_REWARD)
  const treasuryBalanceNumber = Number(treasuryBalance)
  const treasuryBalanceDisplay = Number.isFinite(treasuryBalanceNumber)
    ? treasuryBalanceNumber.toLocaleString(undefined, { maximumFractionDigits: 4 })
    : treasuryBalance
  const displayClicks = Math.max(serverClicks + pendingClicks, 0)
  const minedBar = displayClicks * rewardPerClick

  return (
    <div className="flex-1 p-4 space-y-6 max-w-3xl mx-auto">
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
      <Card className="game-card p-6 space-y-2">
        <div className="flex items-center gap-2 text-lg font-semibold text-foreground">
          <Pickaxe className="h-5 w-5 text-primary" />
          Rhino Lake Mining
        </div>
        <p className="text-sm text-muted-foreground">
          Tap the mine to stack clicks, then claim BAR rewards.
        </p>
      </Card>

      <div className="relative w-full overflow-hidden rounded-xl border border-border bg-muted/20">
        <button
          type="button"
          onClick={handleMineClick}
          disabled={
            isConnecting || isClaiming || isActionLoading || (maxClicks !== null && displayClicks >= maxClicks)
          }
          className="group block w-full cursor-pointer text-left disabled:cursor-not-allowed"
        >
          <img
            src="/rhinolakemine1.png"
            alt="Rhino Lake Mine"
            className="w-full max-h-[520px] object-cover select-none"
          />
        </button>

        <div className="pointer-events-none absolute left-4 top-4 flex flex-col gap-2">
          <div className="pointer-events-auto rounded-md border border-white/60 bg-white/90 px-3 py-2 text-xs font-semibold text-slate-900 shadow-md">
            Mined: {minedBar.toLocaleString()} BAR
          </div>
          <div className="pointer-events-auto rounded-md border border-white/60 bg-white/90 px-3 py-2 text-[11px] font-semibold text-slate-700 shadow-md">
            Clicks: {displayClicks.toLocaleString()}
          </div>
          <div className="pointer-events-auto rounded-md border border-white/60 bg-white/90 px-3 py-2 text-xs font-semibold text-slate-900 shadow-md">
            Currently mineable: {treasuryBalanceDisplay} BAR
          </div>
          <div className="pointer-events-auto rounded-md border border-white/60 bg-white/90 px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-700 shadow-md">
            {currentTier.label} • {rewardPerClick} BAR/click
          </div>
          {isMining && (
            <div className="pointer-events-auto rounded-md border border-white/60 bg-white/90 px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-700 shadow-md">
              Mining...
            </div>
          )}
        </div>

        <div className="absolute bottom-4 right-4">
          <Button
            onClick={(event) => {
              event.stopPropagation()
              handleClaim()
            }}
            disabled={!isAuthenticated || !rewardConfigured || displayClicks <= 0 || isClaiming || isActionLoading}
            className="h-9 rounded-md bg-white/95 px-3 text-xs font-semibold text-slate-900 shadow-md hover:bg-white"
            variant="ghost"
          >
            {isClaiming ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Claiming...
              </>
            ) : (
              "Claim Rhino Lake $BAR"
            )}
          </Button>
        </div>

        {!isAuthenticated && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/40 text-center text-sm font-semibold text-white">
            Connect your Base account to start mining.
          </div>
        )}
      </div>

      <Card className="game-card p-6 space-y-4">
        <div className="space-y-1 text-center">
          <h3 className="text-lg font-semibold text-foreground">Pickaxe Upgrades</h3>
          <p className="text-xs text-muted-foreground">Upgrade to earn more BAR per click.</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          {PICKAXE_TIERS.filter((entry) => entry.id !== "starter").map((entry) => {
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
                      {entry.costUsdc} USDC • {entry.rewardPerClick} BAR/click
                    </p>
                  </div>
                </div>
                <Button
                  onClick={() => handleUpgrade(entry.id)}
                  disabled={owned || isUpgrading || isActionLoading || !isAuthenticated || !pickaxeConfigured}
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
    </div>
  )
}
