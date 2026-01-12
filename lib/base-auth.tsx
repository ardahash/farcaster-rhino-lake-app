"use client"

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { WagmiProvider, createConfig, http, useConnect, useConnection, useDisconnect } from "wagmi"
import { baseAccount } from "wagmi/connectors"
import { numberToHex } from "viem"
import { BASE_CHAINS, DEFAULT_CHAIN_ID } from "@/lib/base-config"

type BaseAuthSession = {
  address: `0x${string}`
  message: string
  signature: `0x${string}`
  chainId: number
}

type BaseAuthContextValue = {
  address: `0x${string}` | null
  chainId: number | null
  isConnected: boolean
  isConnecting: boolean
  isAuthenticated: boolean
  session: BaseAuthSession | null
  error: string | null
  signIn: () => Promise<void>
  signOut: () => void
}

const BaseAuthContext = createContext<BaseAuthContextValue | null>(null)

const wagmiConfig = createConfig({
  chains: BASE_CHAINS,
  connectors: [
    baseAccount({
      appName: "Rhino Lake",
      appLogoUrl: "/icon.svg",
    }),
  ],
  transports: BASE_CHAINS.reduce(
    (acc, chain) => {
      acc[chain.id] = http()
      return acc
    },
    {} as Record<(typeof BASE_CHAINS)[number]["id"], ReturnType<typeof http>>,
  ),
  ssr: true,
})

const queryClient = new QueryClient()

const createNonce = () => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID().replace(/-/g, "")
  }
  return `${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`
}

function BaseAuthInner({ children }: { children: ReactNode }) {
  const { address, chainId, isConnected, isConnecting } = useConnection()
  const { connectAsync, connectors, error: connectError, isPending } = useConnect()
  const { disconnect } = useDisconnect()
  const [session, setSession] = useState<BaseAuthSession | null>(null)
  const [error, setError] = useState<string | null>(null)

  const signIn = useCallback(async () => {
    setError(null)
    const connector = connectors.find((item) => item.id === "baseAccount") ?? connectors[0]
    if (!connector) {
      throw new Error("Base Account connector unavailable.")
    }

    if (isConnected && session) {
      return
    }

    const nonce = createNonce()
    const domain = typeof window !== "undefined" ? window.location.host : "farcaster-rhino-lake-app.vercel.app"
    const uri = typeof window !== "undefined" ? window.location.origin : "https://farcaster-rhino-lake-app.vercel.app"
    const chainIdHex = numberToHex(DEFAULT_CHAIN_ID)

    const connectWithCapabilities = async () =>
      connectAsync({
        connector,
        chainId: DEFAULT_CHAIN_ID,
        capabilities: {
          signInWithEthereum: {
            nonce,
            statement: "Sign in to Rhino Lake.",
            domain,
            uri,
            chainId: chainIdHex,
            version: "1",
          },
        },
        withCapabilities: true,
      })

    try {
      if (isConnected) {
        disconnect()
      }

      const result = await connectWithCapabilities()
      const account = Array.isArray(result.accounts) ? result.accounts[0] : undefined
      const siwe = account?.capabilities?.signInWithEthereum
      if (!account?.address || !siwe?.message || !siwe?.signature) {
        throw new Error("Sign-in response incomplete.")
      }

      setSession({
        address: account.address,
        message: siwe.message,
        signature: siwe.signature,
        chainId: result.chainId,
      })
    } catch (caughtError) {
      if (caughtError instanceof Error && caughtError.name === "ConnectorAlreadyConnectedError") {
        disconnect()
        const result = await connectWithCapabilities()
        const account = Array.isArray(result.accounts) ? result.accounts[0] : undefined
        const siwe = account?.capabilities?.signInWithEthereum
        if (!account?.address || !siwe?.message || !siwe?.signature) {
          throw new Error("Sign-in response incomplete.")
        }

        setSession({
          address: account.address,
          message: siwe.message,
          signature: siwe.signature,
          chainId: result.chainId,
        })
        return
      }

      const message = caughtError instanceof Error ? caughtError.message : "Failed to sign in."
      setError(message)
      throw caughtError
    }
  }, [connectAsync, connectors, disconnect, isConnected, session])

  const signOut = useCallback(() => {
    disconnect()
    setSession(null)
    setError(null)
  }, [disconnect])

  const value = useMemo<BaseAuthContextValue>(
    () => ({
      address: isConnected && address ? address : null,
      chainId: chainId ?? null,
      isConnected,
      isConnecting: isConnecting || isPending,
      isAuthenticated: Boolean(session),
      session,
      error: error ?? connectError?.message ?? null,
      signIn,
      signOut,
    }),
    [address, chainId, connectError, error, isConnected, isConnecting, isPending, session, signIn, signOut],
  )

  return <BaseAuthContext.Provider value={value}>{children}</BaseAuthContext.Provider>
}

export function BaseAuthProvider({ children }: { children: ReactNode }) {
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <BaseAuthInner>{children}</BaseAuthInner>
      </QueryClientProvider>
    </WagmiProvider>
  )
}

export function useBaseAuth() {
  const context = useContext(BaseAuthContext)
  if (!context) {
    throw new Error("useBaseAuth must be used within BaseAuthProvider")
  }
  return context
}
