"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { useBaseAuth } from "@/lib/base-auth"
import { BASE_MAINNET_CHAIN_ID } from "@/lib/base-config"
import { CONTRACTS, ERC20_ABI } from "@/lib/contracts"
import { useCityId } from "@/hooks/use-city-id"
import { useCityState } from "@/hooks/use-city-state"
import { getLevelFromBarLocked } from "@/lib/game-state"
import { buildPathData, sampleAtS } from "@/lib/path/pathMath"
import { RHINO_LAKE_IMAGE_SIZE, RHINO_LAKE_ROAD_PATH_PX } from "@/public/roadPath"
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

const SCENE_WIDTH = RHINO_LAKE_IMAGE_SIZE.width
const SCENE_HEIGHT = RHINO_LAKE_IMAGE_SIZE.height
const WALK_SPEED = 240
const FACING_EPSILON = 0.12

function TownScene({ onEnterTemple }: TownScreenProps) {
  const viewportRef = useRef<HTMLDivElement | null>(null)
  const sceneRef = useRef<HTMLDivElement | null>(null)
  const characterRef = useRef<HTMLImageElement | null>(null)
  const [s, setS] = useState(0)
  const [direction, setDirection] = useState<-1 | 0 | 1>(0)
  const directionRef = useRef(0)
  const [facing, setFacing] = useState<"left" | "right">("right")
  const [showDebug, setShowDebug] = useState(false)
  const [metrics, setMetrics] = useState({
    sceneWidth: SCENE_WIDTH,
    sceneHeight: SCENE_HEIGHT,
    viewportWidth: 0,
    characterWidth: 0,
    characterHeight: 0,
  })
  const metricsRef = useRef(metrics)
  const initializedRef = useRef(false)

  const scaledPoints = useMemo(() => {
    if (!metrics.sceneWidth || !metrics.sceneHeight) return null
    const scaleX = metrics.sceneWidth / RHINO_LAKE_IMAGE_SIZE.width
    const scaleY = metrics.sceneHeight / RHINO_LAKE_IMAGE_SIZE.height
    return RHINO_LAKE_ROAD_PATH_PX.map((point) => ({ x: point.x * scaleX, y: point.y * scaleY }))
  }, [metrics.sceneWidth, metrics.sceneHeight])

  const pathData = useMemo(() => (scaledPoints ? buildPathData(scaledPoints) : null), [scaledPoints])

  useEffect(() => {
    metricsRef.current = metrics
  }, [metrics])

  const updateMetrics = useCallback(() => {
    const viewport = viewportRef.current
    const scene = sceneRef.current
    if (!viewport || !scene) return

    const sceneWidth = scene.clientWidth
    const sceneHeight = scene.clientHeight
    const viewportWidth = viewport.clientWidth
    const characterWidth = characterRef.current?.clientWidth ?? 0
    const characterHeight = characterRef.current?.clientHeight ?? 0
    setMetrics((prev) => {
      if (
        prev.sceneWidth === sceneWidth &&
        prev.sceneHeight === sceneHeight &&
        prev.viewportWidth === viewportWidth &&
        prev.characterWidth === characterWidth &&
        prev.characterHeight === characterHeight
      ) {
        return prev
      }
      return { sceneWidth, sceneHeight, viewportWidth, characterWidth, characterHeight }
    })
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
    if (initializedRef.current || !pathData || pathData.totalLength <= 0) return
    setS(pathData.totalLength / 2)
    const viewport = viewportRef.current
    if (viewport && metrics.sceneWidth && metrics.viewportWidth) {
      const targetScroll = Math.max(
        0,
        Math.min(metrics.sceneWidth - metrics.viewportWidth, metrics.sceneWidth / 2 - metrics.viewportWidth / 2),
      )
      viewport.scrollLeft = targetScroll
    }
    initializedRef.current = true
  }, [metrics.sceneWidth, metrics.viewportWidth, pathData])

  useEffect(() => {
    if (!pathData) return
    setS((prev) => Math.min(Math.max(prev, 0), pathData.totalLength))
  }, [pathData?.totalLength])

  useEffect(() => {
    directionRef.current = direction
    if (direction === 0) return
    let frameId: number
    let lastTime = performance.now()

    const step = (now: number) => {
      const delta = (now - lastTime) / 1000
      lastTime = now
      const pathLength = pathData?.totalLength ?? 0
      if (!pathLength) return
      setS((prev) => {
        let next = prev + directionRef.current * WALK_SPEED * delta
        let nextDirection = directionRef.current
        if (next > pathLength) {
          next = pathLength
          nextDirection = -1
        } else if (next < 0) {
          next = 0
          nextDirection = 1
        }
        if (nextDirection !== directionRef.current) {
          directionRef.current = nextDirection
          setDirection(nextDirection)
        }
        return next
      })
      frameId = requestAnimationFrame(step)
    }

    frameId = requestAnimationFrame(step)
    return () => cancelAnimationFrame(frameId)
  }, [direction, pathData?.totalLength])

  const sample = useMemo(() => {
    if (!pathData) {
      return { pos: { x: 0, y: 0 }, tangent: { x: 1, y: 0 } }
    }
    return sampleAtS(pathData, s)
  }, [pathData, s])

  const debugPolyline = useMemo(() => {
    if (!pathData) return ""
    return pathData.points.map((point) => `${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(" ")
  }, [pathData])

  const spritePosition = useMemo(() => {
    const { sceneWidth, sceneHeight, characterWidth, characterHeight } = metrics
    if (!sceneWidth || !sceneHeight) {
      return { left: 0, top: 0 }
    }
    const left = Math.min(Math.max(sample.pos.x - characterWidth / 2, 0), sceneWidth - characterWidth)
    const top = Math.min(Math.max(sample.pos.y - characterHeight, 0), sceneHeight - characterHeight)
    return { left, top }
  }, [metrics, sample.pos.x, sample.pos.y])

  useEffect(() => {
    const x = sample.tangent.x
    if (Math.abs(x) < FACING_EPSILON) return
    const nextFacing = x < 0 ? "left" : "right"
    setFacing((prev) => (prev === nextFacing ? prev : nextFacing))
  }, [sample.tangent.x])

  useEffect(() => {
    const viewport = viewportRef.current
    if (!viewport || directionRef.current === 0) return
    const { sceneWidth, characterWidth, viewportWidth } = metricsRef.current
    const centerX = spritePosition.left + characterWidth / 2
    const targetScroll = Math.max(0, Math.min(sceneWidth - viewportWidth, centerX - viewportWidth / 2))
    viewport.scrollLeft = targetScroll
  }, [spritePosition.left])

  const spriteSrc =
    direction === 0 ? "/idleMonk.png" : facing === "left" ? "/leftfacingMonk.png" : "/rightfacingMonk.png"

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

          <div className="absolute right-3 top-3 z-10">
            <Button
              type="button"
              size="sm"
              variant={showDebug ? "secondary" : "outline"}
              onClick={() => setShowDebug((prev) => !prev)}
              className="h-8 px-3 text-xs"
            >
              {showDebug ? "Hide Path" : "Show Path"}
            </Button>
          </div>

          {showDebug && pathData && (
            <svg
              className="absolute inset-0 pointer-events-none"
              width={metrics.sceneWidth}
              height={metrics.sceneHeight}
              viewBox={`0 0 ${metrics.sceneWidth} ${metrics.sceneHeight}`}
            >
              <polyline points={debugPolyline} fill="none" stroke="rgba(255, 0, 0, 0.8)" strokeWidth="2" />
              <circle cx={sample.pos.x} cy={sample.pos.y} r="6" fill="rgba(0, 148, 255, 0.85)" />
            </svg>
          )}

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
            className="absolute h-20 w-auto select-none"
            style={{ left: `${spritePosition.left}px`, top: `${spritePosition.top}px` }}
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
