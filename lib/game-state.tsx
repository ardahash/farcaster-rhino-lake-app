"use client"

import { createContext, useContext, type ReactNode, useEffect, useMemo, useState } from "react"
import { useConnectedAddress } from "@/hooks/use-connected-address"
import { BASE_MAINNET_CHAIN_ID } from "@/lib/base-config"

interface GameState {
  hasSeenOnboarding: boolean
}

interface GameContextType {
  state: GameState
  completeOnboarding: () => void
}

const GameContext = createContext<GameContextType | null>(null)

const INITIAL_STATE: GameState = {
  hasSeenOnboarding: false,
}

const LEVEL_BAR_THRESHOLDS = [
  5_000_000,
  10_000_000,
  20_000_000,
  40_000_000,
  80_000_000,
  160_000_000,
  320_000_000,
  640_000_000,
  1_280_000_000,
  2_560_000_000,
] as const

const toBaseUnits = (tokens: number, decimals: number) => {
  const scale = BigInt(decimals)
  return BigInt(tokens) * 10n ** scale
}

export const getLevelFromBarLocked = (barLockedRaw: bigint, decimals: number) => {
  if (!barLockedRaw || barLockedRaw <= 0n) {
    return 0
  }
  let level = 0
  for (let i = 0; i < LEVEL_BAR_THRESHOLDS.length; i += 1) {
    const thresholdRaw = toBaseUnits(LEVEL_BAR_THRESHOLDS[i], decimals)
    if (barLockedRaw >= thresholdRaw) {
      level = i + 1
    }
  }
  return level
}

export const getProgressionState = (barLockedRaw: bigint, decimals: number, hasCity: boolean) => {
  const rawLevel = getLevelFromBarLocked(barLockedRaw, decimals)
  const level = hasCity ? Math.max(1, rawLevel) : 0
  const isStarter = hasCity && rawLevel === 0
  if (!hasCity || rawLevel >= LEVEL_BAR_THRESHOLDS.length) {
    return {
      rawLevel,
      level,
      isStarter,
      nextThresholdTokens: null,
      nextThresholdRaw: null,
    }
  }
  const nextIndex = Math.max(1, rawLevel)
  const nextThresholdTokens = LEVEL_BAR_THRESHOLDS[nextIndex] ?? null
  return {
    rawLevel,
    level,
    isStarter,
    nextThresholdTokens,
    nextThresholdRaw: nextThresholdTokens ? toBaseUnits(nextThresholdTokens, decimals) : null,
  }
}

export const getTownModelForLevel = (level: number) => {
  const clampedLevel = Math.min(Math.max(level, 1), 10)
  return {
    level: clampedLevel,
    src: `/3d/lvl${clampedLevel}.glb`,
  }
}

export const getTownAssetForLevel = (level: number) => {
  const assets = [
    "/lvl1Zenpire.png",
    "/lvl2Zenpire.png",
    "/lvl3Zenpire.png",
    "/lvl4Zenpire.png",
    "/lvl5Zenpire.png",
    "/lvl6Zenpire.png",
    "/lvl7Zenpire.png",
    "/lvl8Zenpire.png",
    "/lvl9Zenpire.png",
    "/lvl10Zenpire.png",
    "/lvl11Zenpire.png",
  ]
  const clampedLevel = Math.min(Math.max(level, 1), assets.length)
  return {
    level: clampedLevel,
    src: assets[clampedLevel - 1] ?? assets[0],
  }
}

const coerceBoolean = (value: unknown, fallback: boolean) =>
  typeof value === "boolean" ? value : fallback

const loadInitialState = (storageKey: string) => {
  if (typeof window === "undefined") {
    return INITIAL_STATE
  }

  try {
    const stored = window.localStorage.getItem(storageKey)
    if (!stored) return INITIAL_STATE
    const parsed = JSON.parse(stored) as Partial<GameState>
    const hasSeenOnboarding = coerceBoolean(parsed.hasSeenOnboarding, INITIAL_STATE.hasSeenOnboarding)

    return {
      hasSeenOnboarding,
    }
  } catch {
    return INITIAL_STATE
  }
}

export function GameProvider({ children }: { children: ReactNode }) {
  const { address, chainId } = useConnectedAddress()
  const storageKey = useMemo(() => {
    const scopedChainId = chainId ?? BASE_MAINNET_CHAIN_ID
    const scopedAddress = address ?? "anon"
    return `rhino-lake:${scopedChainId}:${scopedAddress}:state`
  }, [address, chainId])

  const [state, setState] = useState<GameState>(INITIAL_STATE)
  const [activeKey, setActiveKey] = useState<string | null>(null)

  useEffect(() => {
    if (typeof window === "undefined") return
    setState(loadInitialState(storageKey))
    setActiveKey(storageKey)
  }, [storageKey])

  useEffect(() => {
    if (typeof window === "undefined") return
    if (!activeKey || activeKey !== storageKey) return
    window.localStorage.setItem(storageKey, JSON.stringify(state))
  }, [activeKey, state, storageKey])

  const completeOnboarding = () => {
    setState((prev) => ({ ...prev, hasSeenOnboarding: true }))
  }

  return <GameContext.Provider value={{ state, completeOnboarding }}>{children}</GameContext.Provider>
}

export function useGame() {
  const context = useContext(GameContext)
  if (!context) {
    throw new Error("useGame must be used within GameProvider")
  }
  return context
}
