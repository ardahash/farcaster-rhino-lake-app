"use client"

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { OnchainKitProvider } from "@coinbase/onchainkit"
import { WagmiProvider, createConfig, http, useAccount, useConnect, useDisconnect } from "wagmi"
import { base } from "wagmi/chains"
import { coinbaseWallet, injected } from "wagmi/connectors"

type BaseAuthSession = {
  address: `0x${string}`
  chainId: number
}

type BaseAuthDiagnostics = {
  onchainKitApiKeyPresent: boolean
  appOrigin: string
  lastAttemptAt: number | null
  lastConnector: { id: string; name: string; type: string } | null
  connectors: { id: string; name: string; type: string; ready?: boolean }[]
}

type BaseAuthContextValue = {
  address: `0x${string}` | null
  chainId: number | null
  isConnected: boolean
  isConnecting: boolean
  isAuthenticated: boolean
  session: BaseAuthSession | null
  error: string | null
  diagnostics: BaseAuthDiagnostics
  signIn: (preferred?: "coinbase" | "injected") => Promise<void>
  signOut: () => void
}

const BaseAuthContext = createContext<BaseAuthContextValue | null>(null)

const DEFAULT_APP_ORIGIN =
  process.env.NEXT_PUBLIC_APP_URL ??
  process.env.NEXT_PUBLIC_SITE_URL ??
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : undefined) ??
  "https://rhinolake.com"

const normalizeOrigin = (origin: string) => origin.replace(/\/$/, "")
const APP_ORIGIN = normalizeOrigin(DEFAULT_APP_ORIGIN)

const baseRpcUrl = process.env.NEXT_PUBLIC_BASE_RPC_URL || "https://mainnet.base.org"

const wagmiConfig = createConfig({
  chains: [base],
  connectors: [
    coinbaseWallet({
      appName: "Rhino Lake",
    }),
    injected(),
  ],
  transports: {
    [base.id]: http(baseRpcUrl),
  },
  ssr: true,
})

const queryClient = new QueryClient()

const resolveWalletAddress = (account: unknown) => {
  if (!account) return null
  if (typeof account === "string") return account
  if (typeof account === "object" && account && "address" in account) {
    const address = (account as { address?: string }).address
    return address ?? null
  }
  return null
}

function BaseAuthInner({ children }: { children: ReactNode }) {
  const { address, chainId, isConnected, isConnecting } = useAccount()
  const { connectAsync, connectors, error: connectError, isPending } = useConnect()
  const { disconnect } = useDisconnect()
  const [session, setSession] = useState<BaseAuthSession | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [lastAttemptAt, setLastAttemptAt] = useState<number | null>(null)
  const [lastConnector, setLastConnector] = useState<{
    id: string
    name: string
    type: string
  } | null>(null)

  const signIn = useCallback(async (preferred?: "coinbase" | "injected") => {
    setError(null)
    setLastAttemptAt(Date.now())
    if (isConnected) {
      if (!session && address) {
        setSession({
          address,
          chainId: chainId ?? base.id,
        })
      }
      return
    }

    const injectedConnector = connectors.find((connector) => connector.id === "injected")
    const coinbaseConnector = connectors.find((connector) =>
      connector.name?.toLowerCase().includes("coinbase"),
    )
    const preferredConnector =
      preferred === "injected" ? injectedConnector : preferred === "coinbase" ? coinbaseConnector : null
    const targetConnector = preferredConnector || coinbaseConnector || injectedConnector || connectors[0]

    if (!targetConnector) {
      const noConnectorError = new Error("No supported wallet connector available.")
      setError(noConnectorError.message)
      throw noConnectorError
    }

    setLastConnector({
      id: targetConnector.id,
      name: targetConnector.name ?? targetConnector.id,
      type: targetConnector.type ?? targetConnector.id,
    })

    try {
      const result = await connectAsync({ connector: targetConnector })
      const account = Array.isArray(result.accounts) ? result.accounts[0] : undefined
      const walletAddress = resolveWalletAddress(account)
      if (!walletAddress) {
        throw new Error("No account returned from wallet.")
      }
      setSession({
        address: walletAddress as `0x${string}`,
        chainId: result.chainId,
      })
    } catch (caughtError) {
      const message = caughtError instanceof Error ? caughtError.message : "Failed to sign in."
      setError(message)
      throw caughtError
    }
  }, [address, chainId, connectAsync, connectors, isConnected, session])

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
      isAuthenticated: isConnected,
      session,
      error: error ?? connectError?.message ?? null,
      diagnostics: {
        onchainKitApiKeyPresent: Boolean(process.env.NEXT_PUBLIC_ONCHAINKIT_API_KEY),
        appOrigin: APP_ORIGIN,
        lastAttemptAt,
        lastConnector,
        connectors: connectors.map((connector) => ({
          id: connector.id,
          name: connector.name ?? connector.id,
          type: connector.type ?? connector.id,
          ready: connector.ready,
        })),
      },
      signIn,
      signOut,
    }),
    [
      address,
      chainId,
      connectError,
      connectors,
      error,
      isConnected,
      isConnecting,
      isPending,
      lastAttemptAt,
      lastConnector,
      session,
      signIn,
      signOut,
    ],
  )

  return <BaseAuthContext.Provider value={value}>{children}</BaseAuthContext.Provider>
}

export function BaseAuthProvider({ children }: { children: ReactNode }) {
  const apiKey = process.env.NEXT_PUBLIC_ONCHAINKIT_API_KEY

  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <OnchainKitProvider apiKey={apiKey ?? ""} chain={base}>
          <BaseAuthInner>{children}</BaseAuthInner>
        </OnchainKitProvider>
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
