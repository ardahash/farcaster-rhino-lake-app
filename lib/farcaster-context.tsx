"use client"

import { createContext, useContext, type ReactNode } from "react"

// Mock Farcaster User Interface
export interface FarcasterUser {
  fid: number
  username: string
  displayName: string
  pfpUrl: string
  bio?: string
}

// Mock Farcaster Mini-App Context
interface FarcasterContextType {
  user: FarcasterUser | null
  isLoading: boolean
  signIn: () => Promise<void>
  signOut: () => void
}

const FarcasterContext = createContext<FarcasterContextType | null>(null)

// Mock user data
const MOCK_USER: FarcasterUser = {
  fid: 12345,
  username: "cryptorhinno",
  displayName: "Crypto Rhino",
  pfpUrl: "/rhino-avatar-purple.jpg",
  bio: "Builder of empires, master of ZEN",
}

export function FarcasterProvider({ children }: { children: ReactNode }) {
  // In a real app, this would use @farcaster/miniapp-sdk
  // For now, we'll provide mock data

  const signIn = async () => {
    // Mock sign in - would call miniappSdk.actions.signIn()
    console.log("[v0] Mock Farcaster sign in")
  }

  const signOut = () => {
    console.log("[v0] Mock Farcaster sign out")
  }

  return (
    <FarcasterContext.Provider
      value={{
        user: MOCK_USER,
        isLoading: false,
        signIn,
        signOut,
      }}
    >
      {children}
    </FarcasterContext.Provider>
  )
}

export function useFarcaster() {
  const context = useContext(FarcasterContext)
  if (!context) {
    throw new Error("useFarcaster must be used within FarcasterProvider")
  }
  return context
}
