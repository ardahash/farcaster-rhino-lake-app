"use client"

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from "react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { buildPathData, sampleAtS } from "@/lib/path/pathMath"
import { RHINO_LAKE_IMAGE_SIZE, RHINO_LAKE_ROAD_PATH_PX } from "@/public/roadPath"

const SCENE_WIDTH = RHINO_LAKE_IMAGE_SIZE.width
const SCENE_HEIGHT = RHINO_LAKE_IMAGE_SIZE.height
const WALK_SPEED = 240
const FACING_EPSILON = 0.05
const clamp01 = (value: number) => Math.min(Math.max(value, 0), 1)

const DEFAULT_TOWN_LAYOUT = {
  templePanel: { x: 0.5, y: 0.22 },
  marketPanel: { x: 0.794, y: 0.273 },
  homePanel: { x: 0.151, y: 0.397 },
} as const

type Direction = -1 | 0 | 1

type TownSceneProps = {
  navPanels?: ReactNode
  sceneRef?: RefObject<HTMLDivElement>
}

function TownScene({ navPanels, sceneRef: externalSceneRef }: TownSceneProps) {
  const viewportRef = useRef<HTMLDivElement | null>(null)
  const internalSceneRef = useRef<HTMLDivElement | null>(null)
  const sceneRef = externalSceneRef ?? internalSceneRef
  const characterRef = useRef<HTMLImageElement | null>(null)
  const [s, setS] = useState(0)
  const [direction, setDirection] = useState<Direction>(0)
  const directionRef = useRef(0)
  const [facing, setFacing] = useState<"left" | "right">("right")
  const pointerActiveRef = useRef(false)
  const pointerDirectionRef = useRef<Direction>(0)
  const keyboardDirectionRef = useRef<Direction>(0)
  const pressedKeysRef = useRef({ left: false, right: false })
  const lastKeyRef = useRef<"left" | "right">("right")
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

  const syncDirection = useCallback(() => {
    const nextDirection = pointerActiveRef.current ? pointerDirectionRef.current : keyboardDirectionRef.current
    setDirection(nextDirection)
  }, [])

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
    const stopPointer = () => {
      if (!pointerActiveRef.current) return
      pointerActiveRef.current = false
      pointerDirectionRef.current = 0
      syncDirection()
    }
    window.addEventListener("pointerup", stopPointer)
    window.addEventListener("pointercancel", stopPointer)
    window.addEventListener("blur", stopPointer)
    return () => {
      window.removeEventListener("pointerup", stopPointer)
      window.removeEventListener("pointercancel", stopPointer)
      window.removeEventListener("blur", stopPointer)
    }
  }, [syncDirection])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
        event.preventDefault()
        if (event.key === "ArrowLeft") {
          pressedKeysRef.current.left = true
          lastKeyRef.current = "left"
        } else {
          pressedKeysRef.current.right = true
          lastKeyRef.current = "right"
        }
        if (pressedKeysRef.current.left && pressedKeysRef.current.right) {
          keyboardDirectionRef.current = lastKeyRef.current === "left" ? -1 : 1
        } else if (pressedKeysRef.current.left) {
          keyboardDirectionRef.current = -1
        } else if (pressedKeysRef.current.right) {
          keyboardDirectionRef.current = 1
        }
        syncDirection()
      }
    }

    const handleKeyUp = (event: KeyboardEvent) => {
      if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
        if (event.key === "ArrowLeft") {
          pressedKeysRef.current.left = false
        } else {
          pressedKeysRef.current.right = false
        }
        if (pressedKeysRef.current.left && pressedKeysRef.current.right) {
          keyboardDirectionRef.current = lastKeyRef.current === "left" ? -1 : 1
        } else if (pressedKeysRef.current.left) {
          keyboardDirectionRef.current = -1
        } else if (pressedKeysRef.current.right) {
          keyboardDirectionRef.current = 1
        } else {
          keyboardDirectionRef.current = 0
        }
        syncDirection()
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    window.addEventListener("keyup", handleKeyUp)
    return () => {
      window.removeEventListener("keydown", handleKeyDown)
      window.removeEventListener("keyup", handleKeyUp)
    }
  }, [syncDirection])

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
    if (direction === 0) return
    const movementX = sample.tangent.x * direction
    if (Math.abs(movementX) < FACING_EPSILON) return
    const nextFacing = movementX < 0 ? "left" : "right"
    setFacing((prev) => (prev === nextFacing ? prev : nextFacing))
  }, [direction, sample.tangent.x])

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

  const handlePointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (event.button !== 0) return
      const viewport = viewportRef.current
      if (!viewport) return
      const rect = viewport.getBoundingClientRect()
      if (!rect.width) return
      const offsetX = event.clientX - rect.left
      pointerActiveRef.current = true
      pointerDirectionRef.current = offsetX < rect.width / 2 ? -1 : 1
      syncDirection()
    },
    [syncDirection],
  )

  return (
    <div className="relative w-full">
      <div
        ref={viewportRef}
        onPointerDown={handlePointerDown}
        className="w-full h-[calc(100dvh-5rem)] overflow-hidden touch-none select-none"
      >
        <div ref={sceneRef} className="relative h-full w-[calc((100dvh-5rem)*1376/441)]">
          <img
            src="/rhinolakeTown.png"
            alt="Rhino Lake Town"
            draggable={false}
            style={{ WebkitTouchCallout: "none" }}
            className="absolute inset-0 h-full w-full object-cover pointer-events-none select-none"
          />

          {navPanels}

          <img
            ref={characterRef}
            src={spriteSrc}
            alt="Monk"
            draggable={false}
            onLoad={updateMetrics}
            className="absolute h-[7.5rem] w-auto select-none pointer-events-none"
            style={{ left: `${spritePosition.left}px`, top: `${spritePosition.top}px` }}
          />
        </div>
      </div>
    </div>
  )
}

type TownScreenProps = {
  onNavigate?: (tab: "home" | "army" | "market") => void
}

export function TownScreen({ onNavigate }: TownScreenProps) {
  const [layout, setLayout] = useState(() => DEFAULT_TOWN_LAYOUT)
  const [isEditing, setIsEditing] = useState(false)
  const sceneRef = useRef<HTMLDivElement | null>(null)
  const dragOffsetRef = useRef({ x: 0, y: 0 })
  const isDraggingRef = useRef(false)
  const dragTargetRef = useRef<"templePanel" | "marketPanel" | "homePanel" | null>(null)
  const isDev = process.env.NODE_ENV === "development"

  const activeLayout = isDev ? layout : DEFAULT_TOWN_LAYOUT
  const navItems = [
    { key: "templePanel", label: "Army", tab: "army", disabled: false },
    { key: "marketPanel", label: "Marketplace", tab: "market", disabled: false },
    { key: "homePanel", label: "Home", tab: "home", disabled: false },
  ] as const

  useEffect(() => {
    if (!isDev) return
    const handleKey = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() === "e") {
        setIsEditing((prev) => !prev)
      }
    }
    window.addEventListener("keydown", handleKey)
    return () => window.removeEventListener("keydown", handleKey)
  }, [isDev])

  const handleDragStart =
    (target: "templePanel" | "marketPanel" | "homePanel") =>
    (event: React.PointerEvent<HTMLDivElement>) => {
    event.stopPropagation()
    if (!isDev || !isEditing) return
    const rect = sceneRef.current?.getBoundingClientRect()
    if (!rect) return
    const targetLayout = activeLayout[target]
    const currentX = rect.left + targetLayout.x * rect.width
    const currentY = rect.top + targetLayout.y * rect.height
    dragOffsetRef.current = {
      x: event.clientX - currentX,
      y: event.clientY - currentY,
    }
    isDraggingRef.current = true
    dragTargetRef.current = target
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const handleDragMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!isDev || !isEditing || !isDraggingRef.current) return
    const target = dragTargetRef.current
    if (!target) return
    const rect = sceneRef.current?.getBoundingClientRect()
    if (!rect) return
    const x = clamp01((event.clientX - rect.left - dragOffsetRef.current.x) / rect.width)
    const y = clamp01((event.clientY - rect.top - dragOffsetRef.current.y) / rect.height)
    setLayout((prev) => ({ ...prev, [target]: { x, y } }))
  }

  const handleDragEnd = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!isDev || !isEditing) return
    isDraggingRef.current = false
    dragTargetRef.current = null
    try {
      event.currentTarget.releasePointerCapture(event.pointerId)
    } catch {
      // Ignore release errors.
    }
  }

  const panelInteraction = isEditing ? "pointer-events-auto cursor-grab" : "pointer-events-auto"

  const navPanels = navItems.map((item) => {
    const panel = activeLayout[item.key]
    const panelStyle = {
      left: `${panel.x * 100}%`,
      top: `${panel.y * 100}%`,
    }
    return (
      <div
        key={item.key}
        className={`absolute -translate-x-1/2 -translate-y-1/2 ${panelInteraction}`}
        style={panelStyle}
        onPointerDown={handleDragStart(item.key)}
        onPointerMove={handleDragMove}
        onPointerUp={handleDragEnd}
        onPointerCancel={handleDragEnd}
      >
        <Card className="game-card w-[min(70vw,140px)] p-2 bg-card/80 backdrop-blur border-border/60">
          <Button
            size="sm"
            variant={item.disabled || isEditing ? "outline" : "secondary"}
            className="w-full"
            disabled={item.disabled || isEditing}
            onClick={() => onNavigate?.(item.tab)}
          >
            {item.label}
          </Button>
        </Card>
      </div>
    )
  })

  return (
    <div className="flex-1 relative">
      <TownScene sceneRef={sceneRef} navPanels={navPanels} />
      {isDev && (
        <div className="absolute right-4 top-4 flex items-center gap-2">
          <Button
            size="sm"
            variant={isEditing ? "secondary" : "outline"}
            onClick={() => setIsEditing((prev) => !prev)}
            className="h-8 px-3 text-xs"
          >
            {isEditing ? "Editing" : "Edit Layout"}
          </Button>
        </div>
      )}

      {isDev && isEditing && (
        <div className="absolute left-4 top-4 rounded-md border border-border/60 bg-card/70 px-3 py-2 text-xs backdrop-blur">
          <p className="font-semibold text-foreground">Layout</p>
          <p className="text-muted-foreground">
            templePanel: {activeLayout.templePanel.x.toFixed(3)}, {activeLayout.templePanel.y.toFixed(3)}
          </p>
          <p className="text-muted-foreground">
            marketPanel: {activeLayout.marketPanel.x.toFixed(3)}, {activeLayout.marketPanel.y.toFixed(3)}
          </p>
          <p className="text-muted-foreground">
            homePanel: {activeLayout.homePanel.x.toFixed(3)}, {activeLayout.homePanel.y.toFixed(3)}
          </p>
          <p className="text-muted-foreground">Press "E" to toggle edit.</p>
        </div>
      )}
    </div>
  )
}
