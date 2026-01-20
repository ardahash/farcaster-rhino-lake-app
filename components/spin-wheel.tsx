"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { cn } from "@/lib/utils"

const CHART_COLORS = [
  "var(--color-chart-1)",
  "var(--color-chart-2)",
  "var(--color-chart-3)",
  "var(--color-chart-4)",
  "var(--color-chart-5)",
]

type SpinWheelProps = {
  rewards: readonly string[]
  result?: string | null
  isSpinning?: boolean
  size?: number
  className?: string
}

export function SpinWheel({ rewards, result, isSpinning = false, size = 240, className }: SpinWheelProps) {
  const [rotation, setRotation] = useState(0)
  const rotationRef = useRef(0)

  const segmentAngle = 360 / rewards.length
  const segments = useMemo(
    () =>
      rewards.map((reward, index) => {
        const startAngle = index * segmentAngle
        const endAngle = startAngle + segmentAngle
        const centerAngle = startAngle + segmentAngle / 2
        return {
          reward,
          index,
          startAngle,
          endAngle,
          centerAngle,
          color: CHART_COLORS[index % CHART_COLORS.length],
        }
      }),
    [rewards, segmentAngle],
  )

  const gradient = useMemo(
    () =>
      `conic-gradient(${segments
        .map((segment) => `${segment.color} ${segment.startAngle}deg ${segment.endAngle}deg`)
        .join(", ")})`,
    [segments],
  )

  const winningIndex = useMemo(
    () => (result ? rewards.findIndex((value) => value === result) : -1),
    [rewards, result],
  )

  useEffect(() => {
    if (winningIndex < 0) return
    const centerAngle = segmentAngle * (winningIndex + 0.5)
    const desired = (360 - centerAngle) % 360
    const current = rotationRef.current
    const currentNormalized = ((current % 360) + 360) % 360
    const delta = (desired - currentNormalized + 360) % 360
    const spins = 4
    const nextRotation = current + spins * 360 + delta
    rotationRef.current = nextRotation
    setRotation(nextRotation)
  }, [segmentAngle, winningIndex])

  const labelRadius = Math.round(size * 0.32)
  const centerLabel = result ? `${result} BAR` : isSpinning ? "Spinning..." : "Spin"

  return (
    <div className={cn("relative flex items-center justify-center", className)} style={{ width: size, height: size }}>
      <div className="absolute -top-3 left-1/2 z-10 -translate-x-1/2">
        <div className="h-0 w-0 border-l-[10px] border-r-[10px] border-b-[16px] border-l-transparent border-r-transparent border-b-primary drop-shadow-md" />
      </div>
      <div className="absolute inset-0 overflow-hidden rounded-full border-4 border-primary/30 bg-primary/10 shadow-lg">
        <div
          className="absolute inset-0"
          style={{
            background: gradient,
            transform: `rotate(${rotation}deg)`,
            transition: "transform 3.8s cubic-bezier(0.2, 0.8, 0.2, 1)",
          }}
        >
          {segments.map((segment) => (
            <div
              key={`${segment.reward}-${segment.index}`}
              className={cn(
                "absolute left-1/2 top-1/2 flex items-center justify-center text-[10px] font-semibold",
                winningIndex === segment.index && result ? "text-primary-foreground" : "text-white/90",
              )}
              style={{
                transform: `translate(-50%, -50%) rotate(${segment.centerAngle}deg) translateY(-${labelRadius}px) rotate(-${segment.centerAngle}deg)`,
                textShadow: "0 1px 2px rgba(0,0,0,0.35)",
              }}
            >
              <div className="flex flex-col items-center leading-tight">
                <span>{segment.reward}</span>
                <span className="text-[9px] uppercase tracking-[0.08em]">BAR</span>
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full border border-primary/30 bg-background/90 px-1 text-center text-xs font-semibold text-foreground shadow-inner">
          {centerLabel}
        </div>
      </div>
    </div>
  )
}
