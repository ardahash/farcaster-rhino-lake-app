"use client"

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react"
import { OnchainKitProvider } from "@coinbase/onchainkit"
<<<<<<< Updated upstream
import { useMiniKit } from "@coinbase/onchainkit/minikit"
=======
>>>>>>> Stashed changes
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { WagmiProvider, createConfig, http, useAccount, useConnect, useDisconnect } from "wagmi"
import { baseAccount, injected } from "wagmi/connectors"
import { createPublicClient, numberToHex } from "viem"
import { BASE_CHAINS, BASE_MAINNET_CHAIN, DEFAULT_CHAIN_ID, getRpcUrlForChain } from "@/lib/base-config"

type BaseAuthSession = {
  address: `0x${string}`
  chainId: number
  message?: string
  signature?: `0x${string}`
}

type BaseAuthDiagnostics = {
<<<<<<< Updated upstream
  isMiniApp: boolean
  miniKitPlatform: string | null
  miniKitReady: boolean
=======
>>>>>>> Stashed changes
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
  signIn: () => Promise<void>
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
const APP_LOGO_URL = `${APP_ORIGIN}/icon.png`

const wagmiConfig = createConfig({
  chains: BASE_CHAINS,
  connectors: [
    baseAccount({
      appName: "Rhino Lake",
      appLogoUrl: APP_LOGO_URL,
    }),
    injected(),
  ],
  transports: BASE_CHAINS.reduce(
    (acc, chain) => {
      const rpcUrl = getRpcUrlForChain(chain.id)
      acc[chain.id] = rpcUrl ? http(rpcUrl) : http()
      return acc
    },
    {} as Record<(typeof BASE_CHAINS)[number]["id"], ReturnType<typeof http>>,
  ),
  ssr: true,
})

const baseRpcUrl = getRpcUrlForChain(DEFAULT_CHAIN_ID)
const defaultPublicClients = {
  [DEFAULT_CHAIN_ID]: createPublicClient({
    chain: BASE_MAINNET_CHAIN,
    transport: baseRpcUrl ? http(baseRpcUrl) : http(),
  }),
}

const queryClient = new QueryClient()

const CONNECT_TIMEOUT_MS = 12_000

const createNonce = () => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID().replace(/-/g, "")
  }
  return `${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`
}

function BaseAuthInner({ children }: { children: ReactNode }) {
  const { address, chainId, isConnected, isConnecting } = useAccount()
  const { connectAsync, connectors, error: connectError, isPending, reset: resetConnect } = useConnect()
  const { disconnect } = useDisconnect()
<<<<<<< Updated upstream
  const { context: miniKitContext, isMiniAppReady, setMiniAppReady } = useMiniKit()
=======
>>>>>>> Stashed changes
  const [session, setSession] = useState<BaseAuthSession | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [lastAttemptAt, setLastAttemptAt] = useState<number | null>(null)
  const [lastConnector, setLastConnector] = useState<{
    id: string
    name: string
    type: string
  } | null>(null)

  const signIn = useCallback(async () => {
    setError(null)
    setLastAttemptAt(Date.now())
    if (isConnected) {
      if (!session && address) {
        setSession({
          address,
          chainId: chainId ?? DEFAULT_CHAIN_ID,
        })
      }
      return
    }

    const nonce = createNonce()
    const fallbackOrigin = process.env.NEXT_PUBLIC_APP_URL ?? "https://rhinolake.com"
    const fallbackHost = fallbackOrigin.replace(/^https?:\/\//, "").replace(/\/$/, "")
    const domain = typeof window !== "undefined" ? window.location.host : fallbackHost
    const uri = typeof window !== "undefined" ? window.location.origin : fallbackOrigin
    const chainIdHex = numberToHex(DEFAULT_CHAIN_ID)

<<<<<<< Updated upstream
    if (miniKitContext && !isMiniAppReady) {
      await setMiniAppReady().catch(() => undefined)
    }

    const shouldTryFarcaster = Boolean(miniKitContext)
    const farcasterConnector = shouldTryFarcaster
      ? connectors.find((item) => item.type === "farcasterMiniApp" || item.id === "farcaster")
      : undefined
=======
>>>>>>> Stashed changes
    const baseConnector = connectors.find((item) => item.id === "baseAccount")
    const injectedConnector = connectors.find((item) => item.id === "injected")

    const withTimeout = async <T,>(promise: Promise<T>) => {
      let timeoutId: ReturnType<typeof setTimeout> | undefined
      try {
        const timeoutPromise = new Promise<never>((_, reject) => {
          timeoutId = setTimeout(() => {
            const timeoutError = new Error("Wallet connection timed out. Please try again.")
            timeoutError.name = "ConnectorTimeoutError"
            reject(timeoutError)
          }, CONNECT_TIMEOUT_MS)
        })
        return await Promise.race([promise, timeoutPromise])
      } finally {
        if (timeoutId) {
          clearTimeout(timeoutId)
        }
      }
    }

    const getConnectAddress = (result: Awaited<ReturnType<typeof connectAsync>>) => {
      const account = Array.isArray(result.accounts) ? result.accounts[0] : undefined
      if (!account) {
        throw new Error("No account returned from wallet.")
      }

      if (typeof account === "string") {
        return { address: account, chainId: result.chainId }
      }

      const siwe = account.capabilities?.signInWithEthereum
      return {
        address: account.address,
        chainId: result.chainId,
        message: siwe?.message,
        signature: siwe?.signature,
      }
    }

    const connectWithConnector = async (
      targetConnector: NonNullable<(typeof connectors)[number]>,
      withCapabilities = false,
    ) => {
      setLastConnector({
        id: targetConnector.id,
        name: targetConnector.name ?? targetConnector.id,
        type: targetConnector.type ?? targetConnector.id,
      })
      try {
        return await withTimeout(
          connectAsync({
            connector: targetConnector,
            chainId: DEFAULT_CHAIN_ID,
            ...(withCapabilities
              ? {
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
                }
              : {}),
          }),
        )
      } catch (caughtError) {
        if (caughtError instanceof Error && caughtError.name === "ConnectorTimeoutError") {
          disconnect()
          resetConnect()
        }
        if (caughtError instanceof Error && caughtError.name === "ConnectorAlreadyConnectedError") {
          disconnect()
          resetConnect()
          return withTimeout(
            connectAsync({
              connector: targetConnector,
              chainId: DEFAULT_CHAIN_ID,
              ...(withCapabilities
                ? {
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
                  }
                : {}),
            }),
          )
        }
        throw caughtError
      }
    }

    const shouldFallbackToInjected = (caughtError: unknown) => {
      if (!(caughtError instanceof Error)) return false
      const message = caughtError.message.toLowerCase()
      return (
        message.includes("wallet_connect") ||
        message.includes("not supported") ||
        message.includes("connector not ready") ||
        message.includes("connector not found") ||
        message.includes("provider not found")
      )
    }

    const connectWithCapabilities = async () => {
      if (!baseConnector) {
        throw new Error("Base Account connector not available.")
      }
      return connectWithConnector(baseConnector, true)
    }

    try {
      if (isConnected) {
        disconnect()
      }

<<<<<<< Updated upstream
      if (await tryFarcasterConnector()) {
        return
      }

=======
>>>>>>> Stashed changes
      if (!baseConnector) {
        if (!injectedConnector) {
          throw new Error("No supported wallet connector available.")
        }
        const result = await connectWithConnector(injectedConnector)
        const { address: walletAddress, chainId: connectedChainId } = getConnectAddress(result)
        setSession({
          address: walletAddress,
          chainId: connectedChainId,
        })
        return
      }

      const result = await connectWithCapabilities()
      const { address: walletAddress, chainId: connectedChainId, message, signature } = getConnectAddress(result)

      setSession({
        address: walletAddress,
        message,
        signature,
        chainId: connectedChainId,
      })
    } catch (caughtError) {
      if (shouldFallbackToInjected(caughtError) && injectedConnector) {
        const result = await connectWithConnector(injectedConnector)
        const { address: walletAddress, chainId: connectedChainId } = getConnectAddress(result)
        setSession({
          address: walletAddress,
          chainId: connectedChainId,
        })
        return
      }

      const message = caughtError instanceof Error ? caughtError.message : "Failed to sign in."
      setError(message)
      throw caughtError
    }
  }, [
    address,
    chainId,
    connectAsync,
    connectors,
    disconnect,
    isConnected,
<<<<<<< Updated upstream
    isMiniAppReady,
    miniKitContext,
=======
>>>>>>> Stashed changes
    resetConnect,
    session,
  ])

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
<<<<<<< Updated upstream
        isMiniApp: Boolean(miniKitContext),
        miniKitPlatform: miniKitContext?.client?.platformType ?? null,
        miniKitReady: isMiniAppReady,
=======
>>>>>>> Stashed changes
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
<<<<<<< Updated upstream
      isMiniAppReady,
=======
>>>>>>> Stashed changes
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
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <OnchainKitProvider
          apiKey={process.env.NEXT_PUBLIC_ONCHAINKIT_API_KEY}
          projectId={process.env.NEXT_PUBLIC_ONCHAINKIT_PROJECT_ID}
          chain={BASE_MAINNET_CHAIN}
          defaultPublicClients={defaultPublicClients}
        >
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
