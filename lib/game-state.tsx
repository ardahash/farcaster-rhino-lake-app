"use client"

import { createContext, useContext, type ReactNode, useState } from "react"

interface GameState {
  zenPower: number
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

const INITIAL_STATE: GameState = {
  zenPower: 100,
  cityLevel: 1,
  totalSacrifices: 0,
  stakedZen: 0,
  hasSeenOnboarding: false,
}

export function GameProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<GameState>(INITIAL_STATE)

  const sacrificeZen = async (amount: number) => {
    // Simulate onchain transaction
    console.log("[v0] Simulating sacrifice transaction:", amount, "ZEN")
    await new Promise((resolve) => setTimeout(resolve, 1500))

    setState((prev) => ({
      ...prev,
      zenPower: prev.zenPower + amount * 10,
      totalSacrifices: prev.totalSacrifices + 1,
    }))
  }

  const stakeZen = async (amount: number) => {
    console.log("[v0] Simulating stake transaction:", amount, "ZEN")
    await new Promise((resolve) => setTimeout(resolve, 1500))

    setState((prev) => ({
      ...prev,
      stakedZen: prev.stakedZen + amount,
      cityLevel: Math.floor((prev.stakedZen + amount) / 50) + 1,
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
