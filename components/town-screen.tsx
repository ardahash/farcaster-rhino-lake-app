"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { useBaseAuth } from "@/lib/base-auth"
import { BASE_MAINNET_CHAIN_ID } from "@/lib/base-config"
import { CONTRACTS, ERC20_ABI } from "@/lib/contracts"
import { useCityId } from "@/hooks/use-city-id"
import { useCityState } from "@/hooks/use-city-state"
import { getLevelFromBarLocked } from "@/lib/game-state"
import { formatUnits } from "viem"
import { useReadContract } from "wagmi"
import { ChevronLeft, ChevronRight } from "lucide-react"

const formatTokenValue = (raw: bigint, decimals: number, fallback = "--") => {
  try {
    const value = Number(formatUnits(raw, decimals))
    if (!Number.isFinite(value)) return fallback
    return value.toLocaleString(undefined, { maximumFractionDigits: 4 })
  } catch {
    return fallback
  }
}

type TownScreenProps = {
  onEnterTemple: () => void
}

const SCENE_WIDTH = 1376
const SCENE_HEIGHT = 441
const WALK_SPEED = 240

function TownScene({ onEnterTemple }: TownScreenProps) {
  const viewportRef = useRef<HTMLDivElement | null>(null)
  const sceneRef = useRef<HTMLDivElement | null>(null)
  const characterRef = useRef<HTMLImageElement | null>(null)
  const [position, setPosition] = useState(0)
  const [direction, setDirection] = useState<-1 | 0 | 1>(0)
  const directionRef = useRef(0)
  const metricsRef = useRef({
    sceneWidth: SCENE_WIDTH,
    viewportWidth: 0,
    characterWidth: 0,
  })
  const initializedRef = useRef(false)

  const updateMetrics = useCallback(() => {
    const viewport = viewportRef.current
    const scene = sceneRef.current
    if (!viewport || !scene) return

    const sceneWidth = scene.clientWidth
    const viewportWidth = viewport.clientWidth
    const characterWidth = characterRef.current?.clientWidth ?? 0
    metricsRef.current = { sceneWidth, viewportWidth, characterWidth }

    const maxX = Math.max(sceneWidth - characterWidth, 0)
    if (!initializedRef.current && sceneWidth) {
      const startX = Math.min(maxX, Math.max(0, sceneWidth / 2 - characterWidth / 2))
      setPosition(startX)
      initializedRef.current = true
      const targetScroll = Math.max(0, Math.min(sceneWidth - viewportWidth, sceneWidth / 2 - viewportWidth / 2))
      viewport.scrollLeft = targetScroll
      return
    }
    setPosition((prev) => Math.min(Math.max(prev, 0), maxX))
  }, [])

  useEffect(() => {
    updateMetrics()
    const observer = new ResizeObserver(() => updateMetrics())
    if (viewportRef.current) observer.observe(viewportRef.current)
    if (sceneRef.current) observer.observe(sceneRef.current)
    if (characterRef.current) observer.observe(characterRef.current)
    return () => observer.disconnect()
  }, [updateMetrics])

  useEffect(() => {
    const stop = () => setDirection(0)
    window.addEventListener("pointerup", stop)
    window.addEventListener("pointercancel", stop)
    window.addEventListener("blur", stop)
    return () => {
      window.removeEventListener("pointerup", stop)
      window.removeEventListener("pointercancel", stop)
      window.removeEventListener("blur", stop)
    }
  }, [])

  useEffect(() => {
    directionRef.current = direction
    if (direction === 0) return
    let frameId: number
    let lastTime = performance.now()

    const step = (now: number) => {
      const delta = (now - lastTime) / 1000
      lastTime = now
      const { sceneWidth, characterWidth } = metricsRef.current
      const maxX = Math.max(sceneWidth - characterWidth, 0)
      setPosition((prev) => Math.min(Math.max(prev + direction * WALK_SPEED * delta, 0), maxX))
      frameId = requestAnimationFrame(step)
    }

    frameId = requestAnimationFrame(step)
    return () => cancelAnimationFrame(frameId)
  }, [direction])

  useEffect(() => {
    const viewport = viewportRef.current
    if (!viewport || directionRef.current === 0) return
    const { sceneWidth, characterWidth } = metricsRef.current
    const viewportWidth = viewport.clientWidth
    const centerX = position + characterWidth / 2
    const targetScroll = Math.max(0, Math.min(sceneWidth - viewportWidth, centerX - viewportWidth / 2))
    viewport.scrollLeft = targetScroll
  }, [position])

  const spriteSrc =
    direction === 0 ? "/idleMonk.png" : direction === -1 ? "/leftfacingMonk.png" : "/rightfacingMonk.png"

  return (
    <div className="relative w-full">
      <div
        ref={viewportRef}
        className="w-full overflow-x-auto overflow-y-hidden rounded-lg border border-border bg-muted/40 touch-pan-x"
      >
        <div
          ref={sceneRef}
          className="relative h-[441px] w-[1376px]"
        >
          <img src="/rhinolakeTown.png" alt="Rhino Lake Town" className="absolute inset-0 h-full w-full object-cover" />

          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
            <Button onClick={onEnterTemple} size="lg" className="px-8 text-base font-semibold">
              Enter Temple
            </Button>
          </div>

          <img
            ref={characterRef}
            src={spriteSrc}
            alt="Monk"
            draggable={false}
            onLoad={updateMetrics}
            className="absolute bottom-8 h-20 w-auto select-none"
            style={{ left: `${position}px` }}
          />
        </div>
      </div>

      <div className="pointer-events-none absolute inset-x-4 bottom-4 flex items-center justify-between">
        <Button
          type="button"
          variant="secondary"
          size="icon"
          aria-label="Move left"
          onPointerDown={() => setDirection(-1)}
          onPointerUp={() => setDirection(0)}
          onPointerLeave={() => setDirection(0)}
          onPointerCancel={() => setDirection(0)}
          className="pointer-events-auto h-11 w-11 rounded-full"
        >
          <ChevronLeft className="h-5 w-5" />
        </Button>
        <Button
          type="button"
          variant="secondary"
          size="icon"
          aria-label="Move right"
          onPointerDown={() => setDirection(1)}
          onPointerUp={() => setDirection(0)}
          onPointerLeave={() => setDirection(0)}
          onPointerCancel={() => setDirection(0)}
          className="pointer-events-auto h-11 w-11 rounded-full"
        >
          <ChevronRight className="h-5 w-5" />
        </Button>
      </div>
    </div>
  )
}

export function TownScreen({ onEnterTemple }: TownScreenProps) {
  const { address } = useBaseAuth()
  const { cityId } = useCityId(address)
  const { cityState, isLoading: isCityLoading } = useCityState(cityId, address)

  const { data: barDecimals } = useReadContract({
    address: CONTRACTS.BAR,
    abi: ERC20_ABI,
    functionName: "decimals",
    chainId: BASE_MAINNET_CHAIN_ID,
    query: {
      enabled: Boolean(address),
    },
  })

  const resolvedBarDecimals = Number(barDecimals ?? 18)
  const cityLevel = getLevelFromBarLocked(cityState.barLocked, resolvedBarDecimals)
  const displayLevel = cityLevel > 0 ? cityLevel : 1
  const powerDisplay = useMemo(
    () => formatTokenValue(cityState.barLocked, resolvedBarDecimals),
    [cityState.barLocked, resolvedBarDecimals],
  )

  return (
    <div className="flex-1 p-4 space-y-6 max-w-3xl mx-auto">
      <div className="pt-4 text-center space-y-2">
        <h1 className="text-3xl font-bold text-primary gold-glow">Your Town</h1>
        <p className="text-muted-foreground">Explore the town and head to the temple.</p>
      </div>

      <div className="space-y-4">
        <TownScene onEnterTemple={onEnterTemple} />
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-muted/50 rounded-lg p-3 text-center">
            <p className="text-xs text-muted-foreground mb-1">City Level</p>
            <p className="text-2xl font-bold text-primary">{isCityLoading ? "--" : cityLevel}</p>
          </div>
          <div className="bg-muted/50 rounded-lg p-3 text-center">
            <p className="text-xs text-muted-foreground mb-1">City Power</p>
            <p className="text-2xl font-bold text-foreground">{powerDisplay}</p>
          </div>
        </div>
        <p className="text-center text-xs text-muted-foreground">
          Drag to scroll the town, or hold the arrows to walk.
        </p>
      </div>
    </div>
  )
}
