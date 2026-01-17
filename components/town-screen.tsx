"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { buildPathData, sampleAtS } from "@/lib/path/pathMath"
import { RHINO_LAKE_IMAGE_SIZE, RHINO_LAKE_ROAD_PATH_PX } from "@/public/roadPath"

const SCENE_WIDTH = RHINO_LAKE_IMAGE_SIZE.width
const SCENE_HEIGHT = RHINO_LAKE_IMAGE_SIZE.height
const WALK_SPEED = 240
const FACING_EPSILON = 0.05

type Direction = -1 | 0 | 1

function TownScene() {
  const viewportRef = useRef<HTMLDivElement | null>(null)
  const sceneRef = useRef<HTMLDivElement | null>(null)
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

          <img
            ref={characterRef}
            src={spriteSrc}
            alt="Monk"
            draggable={false}
            onLoad={updateMetrics}
            className="absolute h-60 w-auto select-none pointer-events-none"
            style={{ left: `${spritePosition.left}px`, top: `${spritePosition.top}px` }}
          />
        </div>
      </div>
    </div>
  )
}

export function TownScreen() {
  return (
    <div className="flex-1">
      <TownScene />
    </div>
  )
}
