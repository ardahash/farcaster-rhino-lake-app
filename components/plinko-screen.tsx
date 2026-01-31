"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { useToast } from "@/hooks/use-toast"
import { useBaseAuth } from "@/lib/base-auth"
import { BASE_MAINNET_CHAIN_ID } from "@/lib/base-config"
import { CONTRACTS, ERC20_ABI, PLINKO_ABI } from "@/lib/contracts"
import { useErc20Balance } from "@/lib/use-erc20-balance"
import { PLINKO_MULTIPLIERS_BPS, PLINKO_RISKS, PLINKO_STAKES, getMultiplierLabel, type PlinkoRisk } from "@/lib/plinko"
import { CircleDot, Loader2 } from "lucide-react"
import { encodeFunctionData, formatUnits, parseUnits } from "viem"
import { usePublicClient, useSendTransaction, useSwitchChain } from "wagmi"

type PendingPlay = {
  active: boolean
  risk: number
  slot: number
  multiplierBps: number
  stake: bigint
  payout: bigint
  playedAt: number
  nonce: bigint
}

const BOARD_WIDTH = 360
const BOARD_HEIGHT = 480
const SLOT_COUNT = 9
const USDC_DECIMALS = 6

const riskIndexMap: Record<PlinkoRisk, number> = {
  low: 0,
  medium: 1,
  high: 2,
}

const formatUsdc = (raw: bigint) => {
  try {
    return Number(formatUnits(raw, USDC_DECIMALS)).toFixed(2)
  } catch {
    return "--"
  }
}

type PlinkoBoardProps = {
  playId: number
  targetSlot: number | null
  onSettled: () => void
  soundEnabled: boolean
}

function PlinkoBoard({ playId, targetSlot, onSettled, soundEnabled }: PlinkoBoardProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const engineRef = useRef<any>(null)
  const runnerRef = useRef<any>(null)
  const renderRef = useRef<any>(null)
  const matterRef = useRef<any>(null)
  const ballRef = useRef<any>(null)
  const targetSlotRef = useRef<number | null>(null)
  const slotCentersRef = useRef<number[]>([])
  const settledRef = useRef(false)
  const onSettledRef = useRef(onSettled)
  const audioRef = useRef<AudioContext | null>(null)
  const lastBounceRef = useRef(0)
  const [isReady, setIsReady] = useState(false)

  useEffect(() => {
    onSettledRef.current = onSettled
  }, [onSettled])

  const ensureAudio = useCallback(() => {
    if (!soundEnabled || typeof window === "undefined") return
    if (!audioRef.current) {
      audioRef.current = new AudioContext()
    }
    if (audioRef.current.state === "suspended") {
      audioRef.current.resume().catch(() => null)
    }
  }, [soundEnabled])

  const playTone = useCallback(
    (frequency: number, durationMs: number, when = 0) => {
      if (!soundEnabled || !audioRef.current) return
      const ctx = audioRef.current
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = "sine"
      osc.frequency.value = frequency
      const startTime = ctx.currentTime + when
      gain.gain.setValueAtTime(0.0001, startTime)
      gain.gain.exponentialRampToValueAtTime(0.25, startTime + 0.01)
      gain.gain.exponentialRampToValueAtTime(0.0001, startTime + durationMs / 1000)
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start(startTime)
      osc.stop(startTime + durationMs / 1000 + 0.02)
    },
    [soundEnabled],
  )

  const playBounce = useCallback(() => {
    if (!soundEnabled) return
    ensureAudio()
    const now = performance.now()
    if (now - lastBounceRef.current < 40) return
    lastBounceRef.current = now
    playTone(220 + Math.random() * 120, 80)
  }, [ensureAudio, playTone, soundEnabled])

  const playDing = useCallback(() => {
    if (!soundEnabled) return
    ensureAudio()
    playTone(660, 120, 0)
    playTone(880, 120, 0.12)
    playTone(990, 160, 0.24)
  }, [ensureAudio, playTone, soundEnabled])

  useEffect(() => {
    let cancelled = false
    let cleanup = () => {}

    const setup = async () => {
      if (!containerRef.current) return
      const Matter = await import("matter-js")
      if (cancelled || !containerRef.current) return

      matterRef.current = Matter
      const engine = Matter.Engine.create({ gravity: { y: 1 } })
      const render = Matter.Render.create({
        element: containerRef.current,
        engine,
        options: {
          width: BOARD_WIDTH,
          height: BOARD_HEIGHT,
          wireframes: false,
          background: "transparent",
        },
      })
      const runner = Matter.Runner.create()

      const wallThickness = 40
      const ground = Matter.Bodies.rectangle(BOARD_WIDTH / 2, BOARD_HEIGHT + wallThickness / 2, BOARD_WIDTH, wallThickness, {
        isStatic: true,
        label: "wall",
        render: { fillStyle: "#111827" },
      })
      const leftWall = Matter.Bodies.rectangle(-wallThickness / 2, BOARD_HEIGHT / 2, wallThickness, BOARD_HEIGHT * 2, {
        isStatic: true,
        label: "wall",
        render: { fillStyle: "#111827" },
      })
      const rightWall = Matter.Bodies.rectangle(BOARD_WIDTH + wallThickness / 2, BOARD_HEIGHT / 2, wallThickness, BOARD_HEIGHT * 2, {
        isStatic: true,
        label: "wall",
        render: { fillStyle: "#111827" },
      })

      const pegRadius = 6
      const rows = 8
      const gapX = BOARD_WIDTH / (SLOT_COUNT + 1)
      const gapY = (BOARD_HEIGHT - 140) / (rows + 1)
      const pegs: any[] = []

      for (let row = 0; row < rows; row += 1) {
        const offset = row % 2 === 1
        const columns = SLOT_COUNT - (offset ? 1 : 0)
        for (let col = 0; col < columns; col += 1) {
          const x = gapX * (col + 1) + (offset ? gapX / 2 : 0)
          const y = gapY * (row + 1)
          pegs.push(
            Matter.Bodies.circle(x, y, pegRadius, {
              isStatic: true,
              label: "peg",
              render: { fillStyle: "#94a3b8" },
            }),
          )
        }
      }

      const slotWidth = BOARD_WIDTH / SLOT_COUNT
      const slotWallHeight = 90
      const slotWalls: any[] = []
      const slotSensors: any[] = []
      const slotCenters: number[] = []
      for (let i = 0; i <= SLOT_COUNT; i += 1) {
        const x = slotWidth * i
        slotWalls.push(
          Matter.Bodies.rectangle(x, BOARD_HEIGHT - slotWallHeight / 2, 6, slotWallHeight, {
            isStatic: true,
            label: "wall",
            render: { fillStyle: "#1f2937" },
          }),
        )
      }
      for (let i = 0; i < SLOT_COUNT; i += 1) {
        const centerX = slotWidth * i + slotWidth / 2
        slotCenters.push(centerX)
        slotSensors.push(
          Matter.Bodies.rectangle(centerX, BOARD_HEIGHT - 18, slotWidth - 6, 16, {
            isStatic: true,
            isSensor: true,
            label: `slot-${i}`,
            render: { fillStyle: "transparent" },
          }),
        )
      }
      slotCentersRef.current = slotCenters

      Matter.World.add(engine.world, [ground, leftWall, rightWall, ...slotWalls, ...slotSensors, ...pegs])

      const handleCollision = (event: { pairs: Array<{ bodyA: any; bodyB: any }> }) => {
        event.pairs.forEach((pair) => {
          const labels = [pair.bodyA.label, pair.bodyB.label]
          if (labels.includes("ball") && labels.includes("peg")) {
            playBounce()
          }
        })
      }

      const handleBeforeUpdate = () => {
        const ball = ballRef.current
        if (!ball) return
        const target = targetSlotRef.current
        if (target !== null && slotCentersRef.current[target]) {
          if (ball.position.y > BOARD_HEIGHT * 0.6) {
            const targetX = slotCentersRef.current[target]
            const deltaX = targetX - ball.position.x
            Matter.Body.applyForce(ball, ball.position, { x: deltaX * 0.000002, y: 0 })
          }
        }

        if (ball.position.y > BOARD_HEIGHT - 26 && !settledRef.current) {
          settledRef.current = true
          Matter.World.remove(engine.world, ball)
          ballRef.current = null
          playDing()
          onSettledRef.current()
        }
      }

      Matter.Events.on(engine, "collisionStart", handleCollision)
      Matter.Events.on(engine, "beforeUpdate", handleBeforeUpdate)

      Matter.Render.run(render)
      Matter.Runner.run(runner, engine)

      engineRef.current = engine
      runnerRef.current = runner
      renderRef.current = render
      setIsReady(true)

      render.canvas.style.width = "100%"
      render.canvas.style.height = "100%"
      render.canvas.style.display = "block"

      cleanup = () => {
        setIsReady(false)
        Matter.Events.off(engine, "collisionStart", handleCollision)
        Matter.Events.off(engine, "beforeUpdate", handleBeforeUpdate)
        Matter.Runner.stop(runner)
        Matter.Render.stop(render)
        Matter.World.clear(engine.world, false)
        Matter.Engine.clear(engine)
        if (render.canvas.parentNode) {
          render.canvas.parentNode.removeChild(render.canvas)
        }
      }
    }

    setup()

    return () => {
      cancelled = true
      cleanup()
    }
  }, [playBounce, playDing])

  useEffect(() => {
    if (!isReady) return
    if (playId <= 0 || targetSlot === null) return
    if (!engineRef.current || !matterRef.current) return

    const Matter = matterRef.current
    const engine = engineRef.current
    settledRef.current = false
    targetSlotRef.current = targetSlot

    if (ballRef.current) {
      Matter.World.remove(engine.world, ballRef.current)
      ballRef.current = null
    }

    ensureAudio()

    const slotCenters = slotCentersRef.current
    const targetX = slotCenters[targetSlot] ?? BOARD_WIDTH / 2
    const startX = targetX + (Math.random() * 12 - 6)
    const ball = Matter.Bodies.circle(startX, 18, 10, {
      restitution: 0.5,
      friction: 0,
      density: 1,
      label: "ball",
      render: { fillStyle: "#38bdf8" },
    })

    ballRef.current = ball
    Matter.World.add(engine.world, ball)
  }, [ensureAudio, playId, targetSlot])

  return <div ref={containerRef} className="w-full h-full" />
}

export function PlinkoScreen() {
  const { address, chainId, isAuthenticated, isConnecting, signIn } = useBaseAuth()
  const { toast } = useToast()
  const { sendTransactionAsync, isPending: isTxPending } = useSendTransaction()
  const { switchChainAsync, isPending: isSwitching } = useSwitchChain()
  const publicClient = usePublicClient({ chainId: BASE_MAINNET_CHAIN_ID })

  const usdcAddress = process.env.NEXT_PUBLIC_USDC_ADDRESS as `0x${string}` | undefined
  const plinkoAddress = CONTRACTS.PLINKO as `0x${string}` | undefined

  const usdcToken = (usdcAddress || "0x0000000000000000000000000000000000000000") as `0x${string}`
  const usdcBalance = useErc20Balance({
    token: usdcToken,
    address,
    chainId: BASE_MAINNET_CHAIN_ID,
    enabled: Boolean(address && usdcAddress),
  })

  const [stake, setStake] = useState<(typeof PLINKO_STAKES)[number]>(1)
  const [risk, setRisk] = useState<PlinkoRisk>("low")
  const [pendingPlay, setPendingPlay] = useState<PendingPlay | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [playId, setPlayId] = useState(0)
  const [targetSlot, setTargetSlot] = useState<number | null>(null)
  const [soundEnabled, setSoundEnabled] = useState(true)
  const [isBallAnimating, setIsBallAnimating] = useState(false)
  const riskSectionRef = useRef<HTMLDivElement | null>(null)

  const refreshPending = useCallback(
    async (animate = false) => {
      if (!publicClient || !address || !plinkoAddress) {
        setPendingPlay(null)
        return
      }
      try {
        const result = (await publicClient.readContract({
          address: plinkoAddress,
          abi: PLINKO_ABI,
          functionName: "pendingOf",
          args: [address],
        })) as readonly [boolean, number, number, number, bigint, bigint, bigint, bigint]
        const nextPending: PendingPlay = {
          active: result[0],
          risk: Number(result[1]),
          slot: Number(result[2]),
          multiplierBps: Number(result[3]),
          stake: result[4],
          payout: result[5],
          playedAt: Number(result[6]),
          nonce: result[7],
        }
        if (!nextPending.active) {
          setPendingPlay(null)
          setTargetSlot(null)
          setIsBallAnimating(false)
          return
        }
        setPendingPlay(nextPending)
        if (animate) {
          setTargetSlot(nextPending.slot)
          setPlayId((prev) => prev + 1)
          setIsBallAnimating(true)
        }
      } catch {
        setPendingPlay(null)
        setTargetSlot(null)
        setIsBallAnimating(false)
      }
    },
    [address, plinkoAddress, publicClient],
  )

  useEffect(() => {
    refreshPending()
  }, [refreshPending])

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

  const ensureAllowance = async (amount: bigint) => {
    if (!publicClient || !address || !usdcAddress || !plinkoAddress) {
      throw new Error("Plinko not configured.")
    }
    const allowance = (await publicClient.readContract({
      address: usdcAddress,
      abi: ERC20_ABI,
      functionName: "allowance",
      args: [address, plinkoAddress],
    })) as bigint

    if (allowance >= amount) {
      return
    }

    const approvalTx = await sendTransactionAsync({
      chainId: BASE_MAINNET_CHAIN_ID,
      account: address,
      to: usdcAddress,
      data: encodeFunctionData({
        abi: ERC20_ABI,
        functionName: "approve",
        args: [plinkoAddress, amount],
      }),
    })
    await publicClient.waitForTransactionReceipt({ hash: approvalTx })
  }

  const handlePlay = async () => {
    if (!isAuthenticated || !address) {
      await handleConnect()
      return
    }

    if (!plinkoAddress || !usdcAddress) {
      toast({
        title: "Plinko unavailable",
        description: "Plinko contracts are not configured yet.",
        variant: "destructive",
      })
      return
    }

    if (pendingPlay?.active || isBallAnimating) {
      toast({
        title: "Ball already in play",
        description: "Claim or discard your current result before dropping another ball.",
      })
      return
    }

    const stakeRaw = parseUnits(stake.toString(), USDC_DECIMALS)
    if (usdcBalance.isLoading) {
      toast({
        title: "Balance loading",
        description: "USDC balance is still loading. Try again in a moment.",
      })
      return
    }

    if (usdcBalance.raw < stakeRaw) {
      toast({
        title: "Insufficient USDC",
        description: "Top up your wallet before playing.",
        variant: "destructive",
      })
      return
    }

    setIsPlaying(true)
    try {
      await ensureBaseNetwork()
      await ensureAllowance(stakeRaw)

      const txHash = await sendTransactionAsync({
        chainId: BASE_MAINNET_CHAIN_ID,
        account: address,
        to: plinkoAddress,
        data: encodeFunctionData({
          abi: PLINKO_ABI,
          functionName: "play",
          args: [riskIndexMap[risk], stakeRaw],
        }),
      })
      if (publicClient) {
        await publicClient.waitForTransactionReceipt({ hash: txHash })
      }

      await refreshPending(true)
    } catch (error) {
      toast({
        title: "Plinko failed",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      })
    } finally {
      setIsPlaying(false)
    }
  }

  const handleClaim = async () => {
    if (!isAuthenticated || !address) {
      await handleConnect()
      return
    }

    if (!plinkoAddress) {
      toast({
        title: "Plinko unavailable",
        description: "Plinko contracts are not configured yet.",
        variant: "destructive",
      })
      return
    }

    if (!pendingPlay?.active) {
      toast({
        title: "No pending result",
        description: "Drop a ball to generate a result first.",
      })
      return
    }

    setIsPlaying(true)
    try {
      await ensureBaseNetwork()
      const txHash = await sendTransactionAsync({
        chainId: BASE_MAINNET_CHAIN_ID,
        account: address,
        to: plinkoAddress,
        data: encodeFunctionData({
          abi: PLINKO_ABI,
          functionName: "claim",
        }),
      })
      if (publicClient) {
        await publicClient.waitForTransactionReceipt({ hash: txHash })
      }
      await refreshPending()
    } catch (error) {
      toast({
        title: "Claim failed",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      })
    } finally {
      setIsPlaying(false)
    }
  }

  const handleDiscard = async () => {
    if (!isAuthenticated || !address) {
      await handleConnect()
      return
    }

    if (!plinkoAddress) {
      toast({
        title: "Plinko unavailable",
        description: "Plinko contracts are not configured yet.",
        variant: "destructive",
      })
      return
    }

    if (!pendingPlay?.active) {
      toast({
        title: "Nothing to discard",
        description: "You do not have a pending result.",
      })
      return
    }

    setIsPlaying(true)
    try {
      await ensureBaseNetwork()
      const txHash = await sendTransactionAsync({
        chainId: BASE_MAINNET_CHAIN_ID,
        account: address,
        to: plinkoAddress,
        data: encodeFunctionData({
          abi: PLINKO_ABI,
          functionName: "discard",
        }),
      })
      if (publicClient) {
        await publicClient.waitForTransactionReceipt({ hash: txHash })
      }
      await refreshPending()
    } catch (error) {
      toast({
        title: "Discard failed",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      })
    } finally {
      setIsPlaying(false)
    }
  }

  const isActionLoading = isConnecting || isSwitching || isTxPending || isPlaying
  const multipliers = PLINKO_MULTIPLIERS_BPS[risk]
  const pendingMultiplierLabel = pendingPlay ? getMultiplierLabel(pendingPlay.multiplierBps) : "--"
  const pendingPayout = pendingPlay?.payout ?? 0n
  const pendingStake = pendingPlay?.stake ?? 0n
  const usdcBalanceDisplay = useMemo(() => {
    const value = Number(usdcBalance.formatted)
    if (!Number.isFinite(value)) return "--"
    return value.toLocaleString(undefined, { maximumFractionDigits: 2 })
  }, [usdcBalance.formatted])

  return (
    <div className="flex-1 relative overflow-hidden">
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(circle at top, rgba(14, 116, 144, 0.25), rgba(15, 23, 42, 0.85)), linear-gradient(135deg, rgba(15, 23, 42, 0.92), rgba(30, 41, 59, 0.95))",
        }}
      />
      <div className="relative z-10 mx-auto w-full max-w-3xl px-4 py-10 space-y-6">
        <Card className="game-card p-6 space-y-3 bg-card/80 backdrop-blur border-border/60">
          <div className="flex items-center gap-2 text-lg font-semibold text-foreground">
            <CircleDot className="h-5 w-5 text-primary" />
            Plinko
          </div>
          <p className="text-sm text-muted-foreground">
            Drop one ball per transaction. Claim your winnings or discard the result when you are ready.
          </p>
        </Card>

        <Card className="game-card p-6 bg-card/80 backdrop-blur border-border/60 space-y-4">
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_280px]">
            <div className="space-y-3">
              <div className="relative w-full max-w-[360px] mx-auto aspect-[3/4] overflow-hidden rounded-xl border border-border bg-muted/30">
                <PlinkoBoard
                  playId={playId}
                  targetSlot={targetSlot}
                  soundEnabled={soundEnabled}
                  onSettled={() => setIsBallAnimating(false)}
                />
                {!plinkoAddress && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/50 text-center text-xs font-semibold text-white">
                    Configure NEXT_PUBLIC_PLINKO_ADDRESS to enable Plinko.
                  </div>
                )}
                {!isAuthenticated && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/40 text-center text-xs font-semibold text-white">
                    Connect your Base account to play.
                  </div>
                )}
              </div>
              <div className="grid grid-cols-9 gap-1 text-[10px] text-center text-muted-foreground">
                {multipliers.map((multiplier, index) => (
                  <div
                    key={`${risk}-${index}`}
                    className={`rounded-md px-1 py-1 ${
                      pendingPlay?.active && pendingPlay.slot === index
                        ? "bg-primary/20 text-primary"
                        : "bg-muted/50"
                    }`}
                  >
                    {(multiplier / 10000).toFixed(multiplier % 10000 === 0 ? 0 : 2)}x
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-4">
              <Button
                onClick={handlePlay}
                disabled={!plinkoAddress || isActionLoading || isBallAnimating}
                className="w-full h-11 text-base font-semibold"
              >
                {isPlaying ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Dropping Ball...
                  </>
                ) : (
                  `Drop Ball (${stake} USDC)`
                )}
              </Button>

              <div className="rounded-lg border border-border/60 bg-muted/30 p-4 space-y-2">
                <p className="text-xs font-semibold text-muted-foreground">Stake (USDC)</p>
                <div className="flex flex-wrap gap-2">
                  {PLINKO_STAKES.map((amount) => (
                    <Button
                      key={amount}
                      size="sm"
                      variant={stake === amount ? "default" : "outline"}
                      onClick={() => setStake(amount)}
                    >
                      {amount} USDC
                    </Button>
                  ))}
                </div>
                <p className="text-[11px] text-muted-foreground">Wallet balance: {usdcBalanceDisplay} USDC</p>
              </div>

              <div ref={riskSectionRef} className="rounded-lg border border-border/60 bg-muted/30 p-4 space-y-2">
                <p className="text-xs font-semibold text-muted-foreground">Risk Level</p>
                <div className="flex flex-wrap gap-2">
                  {PLINKO_RISKS.map((entry) => (
                    <Button
                      key={entry.id}
                      size="sm"
                      variant={risk === entry.id ? "default" : "outline"}
                      onClick={() => setRisk(entry.id)}
                    >
                      {entry.label}
                    </Button>
                  ))}
                </div>
                <p className="text-[11px] text-muted-foreground">Expected RTP: {PLINKO_RISKS[riskIndexMap[risk]].rtp}</p>
              </div>

              <div className="rounded-lg border border-border/60 bg-muted/30 p-4 space-y-2">
                <p className="text-xs font-semibold text-muted-foreground">Sound</p>
                <Button
                  size="sm"
                  variant={soundEnabled ? "default" : "outline"}
                  onClick={() => setSoundEnabled((prev) => !prev)}
                >
                  {soundEnabled ? "Sound On" : "Sound Off"}
                </Button>
              </div>

              {pendingPlay?.active && (
                <div className="rounded-lg border border-border/60 bg-muted/30 p-4 space-y-2">
                  <p className="text-xs font-semibold text-muted-foreground">Pending Result</p>
                  <p className="text-sm text-foreground">
                    Slot {pendingPlay.slot + 1} - {pendingMultiplierLabel} multiplier
                  </p>
                  <p className="text-sm text-foreground">
                    Payout: {formatUsdc(pendingPayout)} USDC (stake {formatUsdc(pendingStake)} USDC)
                  </p>
                  <div className="flex gap-2">
                    <Button
                      onClick={handleClaim}
                      disabled={isActionLoading}
                      className="flex-1"
                      variant="default"
                    >
                      Claim
                    </Button>
                    <Button
                      onClick={handleDiscard}
                      disabled={isActionLoading}
                      className="flex-1"
                      variant="outline"
                    >
                      Discard
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </Card>

        <Card className="game-card p-6 bg-card/80 backdrop-blur border-border/60 space-y-3">
          <div className="space-y-1">
            <h3 className="text-lg font-semibold text-foreground">How Plinko RTP Works</h3>
            <p className="text-xs text-muted-foreground">
              Most online Plinko games land between 96% and 98% RTP depending on the risk setting.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-3 text-xs text-muted-foreground">
            <div className="rounded-lg border border-border/60 bg-muted/30 p-3">
              <p className="font-semibold text-foreground">Low Risk</p>
              <p>RTP around 98%. Smaller multipliers hit more often.</p>
            </div>
            <div className="rounded-lg border border-border/60 bg-muted/30 p-3">
              <p className="font-semibold text-foreground">Medium Risk</p>
              <p>RTP around 96-97%. Balanced multipliers and returns.</p>
            </div>
            <div className="rounded-lg border border-border/60 bg-muted/30 p-3">
              <p className="font-semibold text-foreground">High Risk</p>
              <p>RTP around 96%. Fewer wins, larger spikes.</p>
            </div>
          </div>
          <div className="rounded-lg border border-border/60 bg-muted/30 p-3 text-xs text-muted-foreground">
            <p className="font-semibold text-foreground">How Payouts Work</p>
            <p>
              Each slot has a multiplier applied to your stake. Example: 0.5x on 1 USDC returns 0.50 USDC. A 10x
              multiplier returns 10 USDC on a 1 USDC stake.
            </p>
          </div>
          <p className="text-[11px] text-muted-foreground">
            RTP ranges are based on real Plinko games from providers like BGaming and Spribe.
          </p>
        </Card>
      </div>
    </div>
  )
}
