"use client"

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react"
import { OnchainKitProvider } from "@coinbase/onchainkit"
import { useMiniKit } from "@coinbase/onchainkit/minikit"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { WagmiProvider, createConfig, http, useAccount, useConnect, useDisconnect } from "wagmi"
import { baseAccount, injected } from "wagmi/connectors"
import { farcasterMiniApp } from "@farcaster/miniapp-wagmi-connector"
import { createPublicClient, numberToHex } from "viem"
import { BASE_CHAINS, BASE_MAINNET_CHAIN, DEFAULT_CHAIN_ID, getRpcUrlForChain } from "@/lib/base-config"

type BaseAuthSession = {
  address: `0x${string}`
  chainId: number
  message?: string
  signature?: `0x${string}`
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
    farcasterMiniApp(),
    baseAccount({
      appName: "Rhino Lake",
      appLogoUrl: "/icon.svg",
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

const createNonce = () => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID().replace(/-/g, "")
  }
  return `${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`
}

function BaseAuthInner({ children }: { children: ReactNode }) {
  const { address, chainId, isConnected, isConnecting } = useAccount()
  const { connectAsync, connectors, error: connectError, isPending } = useConnect()
  const { disconnect } = useDisconnect()
  const { context: miniKitContext, isMiniAppReady, setMiniAppReady } = useMiniKit()
  const [session, setSession] = useState<BaseAuthSession | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (isMiniAppReady) return
    setMiniAppReady().catch(() => undefined)
  }, [isMiniAppReady, setMiniAppReady])

  const signIn = useCallback(async () => {
    setError(null)
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

    const farcasterConnector = connectors.find(
      (item) => item.type === "farcasterMiniApp" || item.id === "farcaster",
    )
    const baseConnector = connectors.find((item) => item.id === "baseAccount")
    const injectedConnector = connectors.find((item) => item.id === "injected")

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
      try {
        return await connectAsync({
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
        })
      } catch (caughtError) {
        if (caughtError instanceof Error && caughtError.name === "ConnectorAlreadyConnectedError") {
          disconnect()
          return connectAsync({
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
          })
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

    const connectWithCapabilities = async () =>
      connectWithConnector(baseConnector ?? connectors[0], true)

    const shouldAbortFallback = (caughtError: unknown) => {
      if (!(caughtError instanceof Error)) return false
      const message = caughtError.message.toLowerCase()
      return message.includes("user rejected") || message.includes("user denied") || message.includes("rejected")
    }

    const tryFarcasterConnector = async () => {
      if (!farcasterConnector) return false
      try {
        const result = await connectWithConnector(farcasterConnector)
        const { address: walletAddress, chainId: connectedChainId } = getConnectAddress(result)
        setSession({
          address: walletAddress,
          chainId: connectedChainId,
        })
        return true
      } catch (caughtError) {
        if (shouldAbortFallback(caughtError)) {
          throw caughtError
        }
        return false
      }
    }

    try {
      if (isConnected) {
        disconnect()
      }

      if (await tryFarcasterConnector()) {
        return
      }

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
  }, [address, chainId, connectAsync, connectors, disconnect, isConnected, session])

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
        <OnchainKitProvider
          apiKey={process.env.NEXT_PUBLIC_ONCHAINKIT_API_KEY}
          chain={BASE_MAINNET_CHAIN}
          defaultPublicClients={defaultPublicClients}
          miniKit={{
            enabled: true,
            autoConnect: true,
          }}
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
