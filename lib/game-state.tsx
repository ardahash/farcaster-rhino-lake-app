"use client"

import { createContext, useContext, type ReactNode, useEffect, useState } from "react"

interface GameState {
  zenPower: number
  barPoints: number
  cityLevel: number
  totalSacrifices: number
  stakedZen: number
  hasSeenOnboarding: boolean
}

interface GameContextType {
  state: GameState
  sacrificeZen: (amount: number) => Promise<void>
  stakeZen: (amount: number) => Promise<void>
  completeOnboarding: () => void
}

const GameContext = createContext<GameContextType | null>(null)

const STORAGE_KEY = "rhino-lake-game-state"

const INITIAL_STATE: GameState = {
  zenPower: 100,
  barPoints: 0,
  cityLevel: 1,
  totalSacrifices: 0,
  stakedZen: 0,
  hasSeenOnboarding: false,
}

const clampLevel = (level: number) => Math.max(1, Math.floor(level))
const BAR_POINTS_PER_ZEN = 10000

export const getTotalBurnedForLevel = (level: number) => {
  const safeLevel = clampLevel(level)
  if (safeLevel <= 1) return 0
  return Math.pow(2, safeLevel - 1) - 1
}

export const getNextLevelCost = (currentLevel: number) => {
  const safeLevel = clampLevel(currentLevel)
  return Math.pow(2, safeLevel - 1)
}

export const getLevelFromBurned = (burned: number) => {
  if (!Number.isFinite(burned) || burned <= 0) return 1
  let level = 1
  while (burned >= getTotalBurnedForLevel(level + 1)) {
    level += 1
  }
  return level
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

const coerceNumber = (value: unknown, fallback: number) =>
  typeof value === "number" && Number.isFinite(value) ? value : fallback

const coerceBoolean = (value: unknown, fallback: boolean) =>
  typeof value === "boolean" ? value : fallback

const loadInitialState = () => {
  if (typeof window === "undefined") {
    return INITIAL_STATE
  }

  try {
    const stored = window.localStorage.getItem(STORAGE_KEY)
    if (!stored) return INITIAL_STATE
    const parsed = JSON.parse(stored) as Partial<GameState>
    const stakedZen = coerceNumber(parsed.stakedZen, INITIAL_STATE.stakedZen)
    const zenPower = coerceNumber(parsed.zenPower, INITIAL_STATE.zenPower)
    const barPoints = coerceNumber(parsed.barPoints, INITIAL_STATE.barPoints)
    const totalSacrifices = coerceNumber(parsed.totalSacrifices, INITIAL_STATE.totalSacrifices)
    const hasSeenOnboarding = coerceBoolean(parsed.hasSeenOnboarding, INITIAL_STATE.hasSeenOnboarding)
    const cityLevel = getLevelFromBurned(stakedZen)

    return {
      zenPower,
      barPoints,
      cityLevel,
      totalSacrifices,
      stakedZen,
      hasSeenOnboarding,
    }
  } catch {
    return INITIAL_STATE
  }
}

export function GameProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<GameState>(INITIAL_STATE)
  const [hasHydrated, setHasHydrated] = useState(false)

  useEffect(() => {
    if (typeof window === "undefined") return
    setState(loadInitialState())
    setHasHydrated(true)
  }, [])

  useEffect(() => {
    if (!hasHydrated || typeof window === "undefined") return
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  }, [hasHydrated, state])

  const sacrificeZen = async (amount: number) => {
    setState((prev) => ({
      ...prev,
      zenPower: prev.zenPower + amount * 10,
      barPoints: prev.barPoints + amount * BAR_POINTS_PER_ZEN,
      totalSacrifices: prev.totalSacrifices + 1,
    }))
  }

  const stakeZen = async (amount: number) => {
    setState((prev) => ({
      ...prev,
      stakedZen: prev.stakedZen + amount,
      cityLevel: getLevelFromBurned(prev.stakedZen + amount),
      barPoints: prev.barPoints + amount * BAR_POINTS_PER_ZEN,
    }))
  }

  const completeOnboarding = () => {
    setState((prev) => ({ ...prev, hasSeenOnboarding: true }))
  }

  return (
    <GameContext.Provider value={{ state, sacrificeZen, stakeZen, completeOnboarding }}>
      {children}
    </GameContext.Provider>
  )
}

export function useGame() {
  const context = useContext(GameContext)
  if (!context) {
    throw new Error("useGame must be used within GameProvider")
  }
  return context
}
