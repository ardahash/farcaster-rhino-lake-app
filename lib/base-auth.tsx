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
import { baseAccount, injected } from "wagmi/connectors"
import { numberToHex } from "viem"
import { BASE_CHAINS, DEFAULT_CHAIN_ID } from "@/lib/base-config"

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
    baseAccount({
      appName: "Rhino Lake",
      appLogoUrl: "/icon.svg",
    }),
    injected(),
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
    const domain = typeof window !== "undefined" ? window.location.host : "farcaster-rhino-lake-app.vercel.app"
    const uri = typeof window !== "undefined" ? window.location.origin : "https://farcaster-rhino-lake-app.vercel.app"
    const chainIdHex = numberToHex(DEFAULT_CHAIN_ID)

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
      connectWithConnector(
        baseConnector ?? connectors[0],
        true,
      )

    try {
      if (isConnected) {
        disconnect()
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
