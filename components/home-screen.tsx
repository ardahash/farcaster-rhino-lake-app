"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useName } from "@coinbase/onchainkit/identity"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { useBaseAuth } from "@/lib/base-auth"
import { BASE_CHAINS, DEFAULT_CHAIN_ID, getPaymasterUrl } from "@/lib/base-config"
import { getTownAssetForLevel, useGame } from "@/lib/game-state"
import { useErc20Balance, useNativeBalance } from "@/lib/use-erc20-balance"
import { USDC_ADDRESS, WETH_ADDRESS, ZEN_TOKEN_ADDRESS } from "@/lib/aerodrome"
import { Loader2, Sparkles, Coins } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { useCallsStatus, usePublicClient, useReadContract, useSendCalls, useSendTransaction, useSwitchChain } from "wagmi"
import { useCapabilities } from "wagmi/experimental"
import { base } from "wagmi/chains"
import { encodeFunctionData, parseUnits } from "viem"
import { BASE_MAINNET_CHAIN_ID, ERC20_ABI, ZEN_BURN_MANAGER_ABI, ZEN_BURN_MANAGER_ADDRESS } from "@/lib/zen-burn"
import { SwapPanel } from "@/components/swap-panel"
import { ToastAction } from "@/components/ui/toast"
import { ConnectionDebug } from "@/components/connection-debug"
import { ManifestStatusPanel } from "@/components/manifest-status"

const formatBaseHandle = (name: string) => {
  const trimmed = name.startsWith("@") ? name.slice(1) : name
  const lowered = trimmed.toLowerCase()
  if (lowered.endsWith(".base.eth")) {
    return trimmed.slice(0, -".base.eth".length)
  }
  if (lowered.endsWith(".base")) {
    return trimmed.slice(0, -".base".length)
  }
  return trimmed.split(".")[0] ?? trimmed
}

export function HomeScreen() {
  const { address, chainId, isAuthenticated, isConnecting, signIn, error: authError } = useBaseAuth()
  const { state, sacrificeZen } = useGame()
  const { toast } = useToast()
  const publicClient = usePublicClient({ chainId: BASE_MAINNET_CHAIN_ID })
  const [isAuthLoading, setIsAuthLoading] = useState(false)
  const [callId, setCallId] = useState<string | null>(null)
  const handledCallIdRef = useRef<string | null>(null)
  const { sendCallsAsync, isPending: isSending } = useSendCalls()
  const { sendTransactionAsync, isPending: isTxPending } = useSendTransaction()
  const { switchChainAsync, isPending: isSwitching } = useSwitchChain()
  const { data: availableCapabilities } = useCapabilities({
    account: address ?? undefined,
  })
  const { data: resolvedName } = useName({ address, chain: base })
  const { data: zenAddress } = useReadContract({
    address: ZEN_BURN_MANAGER_ADDRESS,
    abi: ZEN_BURN_MANAGER_ABI,
    functionName: "zen",
    chainId: BASE_MAINNET_CHAIN_ID,
  })
  const { data: zenDecimals } = useReadContract({
    address: ZEN_BURN_MANAGER_ADDRESS,
    abi: ZEN_BURN_MANAGER_ABI,
    functionName: "zenDecimals",
    chainId: BASE_MAINNET_CHAIN_ID,
  })

  const { data: callsStatus } = useCallsStatus({
    id: callId ?? "",
    query: {
      enabled: Boolean(callId),
      refetchInterval: callId ? 2000 : false,
    },
  })

  const zenBalance = useErc20Balance({
    token: ZEN_TOKEN_ADDRESS,
    address,
    chainId: BASE_MAINNET_CHAIN_ID,
    enabled: Boolean(address),
  })

  const usdcBalance = useErc20Balance({
    token: USDC_ADDRESS,
    address,
    chainId: BASE_MAINNET_CHAIN_ID,
    enabled: Boolean(address),
  })

  const wethBalance = useErc20Balance({
    token: WETH_ADDRESS,
    address,
    chainId: BASE_MAINNET_CHAIN_ID,
    enabled: Boolean(address),
  })

  const ethBalance = useNativeBalance({
    address,
    chainId: BASE_MAINNET_CHAIN_ID,
    enabled: Boolean(address),
  })

  const refetchBalances = useCallback(() => {
    zenBalance.refetch()
    usdcBalance.refetch()
    wethBalance.refetch()
    ethBalance.refetch()
  }, [zenBalance.refetch, usdcBalance.refetch, wethBalance.refetch, ethBalance.refetch])

  const zenThresholdRaw = useMemo(() => {
    const decimals = zenBalance.decimals ?? 18
    return parseUnits("0.01", decimals)
  }, [zenBalance.decimals])

  const resolvePaymasterCapabilities = useCallback(
    (targetChainId: number, paymasterUrl?: string) => {
      if (!availableCapabilities || !paymasterUrl) return undefined
      const chainCaps = availableCapabilities[targetChainId]
      if (chainCaps?.paymasterService?.supported) {
        return {
          paymasterService: {
            url: paymasterUrl,
            optional: false,
          },
        }
      }
      return undefined
    },
    [availableCapabilities],
  )

  const handleSacrificeSuccess = useCallback(
    (hash?: `0x${string}`) => {
      sacrificeZen(0.01)
      refetchBalances()
      const shortHash = hash ? `${hash.slice(0, 6)}...${hash.slice(-4)}` : "View in explorer"
      toast({
        title: "Sacrifice Complete!",
        description: `Tx ${shortHash}`,
        action: hash ? (
          <ToastAction altText="Copy transaction hash" onClick={() => navigator.clipboard.writeText(hash)}>
            Copy
          </ToastAction>
        ) : undefined,
      })
    },
    [refetchBalances, sacrificeZen, toast],
  )

  const handleSacrificeError = useCallback(
    (error: unknown) => {
      toast({
        title: "Sacrifice Failed",
        description: error instanceof Error ? error.message : "Please try again",
        variant: "destructive",
      })
    },
    [toast],
  )

  const isSendCallsUnsupported = (error: unknown) => {
    if (!(error instanceof Error)) return false
    const message = error.message.toLowerCase()
    return (
      message.includes("wallet_sendcalls") ||
      message.includes("not supported") ||
      message.includes("unsupported") ||
      message.includes("method not found")
    )
  }

  const handleSacrifice = async () => {
    try {
      if (!address || !isAuthenticated) {
        throw new Error("Connect your Base account to continue.")
      }

      if (!zenBalance.isLoading && zenBalance.raw < zenThresholdRaw) {
        throw new Error("You need ZEN to burn. Swap first.")
      }

      const supportedChainIds = new Set(BASE_CHAINS.map((chain) => chain.id))
      const activeChainId = chainId ?? DEFAULT_CHAIN_ID
      if (!supportedChainIds.has(activeChainId)) {
        await switchChainAsync({ chainId: DEFAULT_CHAIN_ID })
        throw new Error("Switching network. Please try again.")
      }

      if (activeChainId !== BASE_MAINNET_CHAIN_ID) {
        await switchChainAsync({ chainId: BASE_MAINNET_CHAIN_ID })
        throw new Error("Switching to Base mainnet. Please try again.")
      }

      if (!zenAddress) {
        throw new Error("ZEN token address not available.")
      }

      const paymasterUrl = getPaymasterUrl(activeChainId)
      const paymasterCapabilities = resolvePaymasterCapabilities(activeChainId, paymasterUrl)

      const decimals = typeof zenDecimals === "number" ? zenDecimals : Number(zenDecimals ?? 18)
      const amount = parseUnits("0.01", decimals)
      const approveData = encodeFunctionData({
        abi: ERC20_ABI,
        functionName: "approve",
        args: [ZEN_BURN_MANAGER_ADDRESS, amount],
      })
      const burnData = encodeFunctionData({
        abi: ZEN_BURN_MANAGER_ABI,
        functionName: "burnZen",
        args: [amount],
      })

      try {
        const response = await sendCallsAsync({
          chainId: activeChainId,
          account: address,
          calls: [
            {
              to: zenAddress,
              data: approveData,
            },
            {
              to: ZEN_BURN_MANAGER_ADDRESS,
              data: burnData,
            },
          ],
          capabilities: paymasterCapabilities,
          forceAtomic: true,
        })

        setCallId(response.id)
        return
      } catch (error) {
        if (!isSendCallsUnsupported(error)) {
          throw error
        }
      }

      if (!publicClient) {
        throw new Error("RPC not ready.")
      }

      const approvalTx = await sendTransactionAsync({
        chainId: activeChainId,
        to: zenAddress,
        data: approveData,
      })
      await publicClient.waitForTransactionReceipt({ hash: approvalTx })

      const burnTx = await sendTransactionAsync({
        chainId: activeChainId,
        to: ZEN_BURN_MANAGER_ADDRESS,
        data: burnData,
      })
      await publicClient.waitForTransactionReceipt({ hash: burnTx })
      handleSacrificeSuccess(burnTx)
    } catch (error) {
      handleSacrificeError(error)
    }
  }

  const handleConnect = async () => {
    setIsAuthLoading(true)
    try {
      await signIn()
      toast({
        title: "Base Account Connected",
        description: "You're ready to sacrifice ZEN onchain.",
      })
    } catch (caughtError) {
      const message = caughtError instanceof Error ? caughtError.message : "Please try again."
      toast({
        title: "Connection failed",
        description: message,
        variant: "destructive",
      })
    } finally {
      setIsAuthLoading(false)
    }
  }

  useEffect(() => {
    if (!callId || !callsStatus) return
    if (handledCallIdRef.current === callId) return

    if (callsStatus.status === "failure") {
      handledCallIdRef.current = callId
      setCallId(null)
      handleSacrificeError(new Error("The sacrifice transaction did not complete."))
    }

    if (callsStatus.status === "success" && callsStatus.receipts?.length) {
      const txHash = callsStatus.receipts[callsStatus.receipts.length - 1]?.transactionHash
      handledCallIdRef.current = callId
      setCallId(null)
      handleSacrificeSuccess(txHash)
    }
  }, [callId, callsStatus, handleSacrificeError, handleSacrificeSuccess])

  const baseName =
    typeof resolvedName === "string"
      ? resolvedName
      : resolvedName && typeof resolvedName === "object" && "name" in resolvedName
        ? resolvedName.name
        : null
  const baseHandle = baseName ? formatBaseHandle(baseName) : null
  const shortAddress = address ? `${address.slice(0, 6)}...${address.slice(-4)}` : "guest"
  const displayName = isAuthenticated ? (baseHandle ? `@${baseHandle}` : "Base Account") : "Rhino Lake Ruler"
  const username = isAuthenticated ? (baseName?.startsWith("@") ? baseName.slice(1) : baseName ?? shortAddress) : "rhino-lake"
  const avatarUrl = "/rhino-avatar-purple.jpg"
  const avatarFallback = displayName[0] ?? "?"
  const isPrimaryLoading =
    isSending || isTxPending || Boolean(callId) || isAuthLoading || isConnecting || isSwitching
  const townAsset = getTownAssetForLevel(state.cityLevel)
  const hasZen = zenBalance.raw >= zenThresholdRaw
  const shouldDisableBurn = isAuthenticated && !zenBalance.isLoading && !hasZen
  const isPrimaryDisabled = isPrimaryLoading || shouldDisableBurn
  const highlightSwap = isAuthenticated && !zenBalance.isLoading && !hasZen
  const zenBalanceValue = Number(zenBalance.formatted)
  const zenBalanceDisplay =
    isAuthenticated && zenBalance.isLoading
      ? "..."
      : isAuthenticated && Number.isFinite(zenBalanceValue)
        ? zenBalanceValue.toFixed(4)
        : "--"
  const usdcBalanceValue = Number(usdcBalance.formatted)
  const usdcBalanceDisplay =
    isAuthenticated && usdcBalance.isLoading
      ? "..."
      : isAuthenticated && Number.isFinite(usdcBalanceValue)
        ? usdcBalanceValue.toFixed(4)
        : "--"
  const wethBalanceValue = Number(wethBalance.formatted)
  const wethBalanceDisplay =
    isAuthenticated && wethBalance.isLoading
      ? "..."
      : isAuthenticated && Number.isFinite(wethBalanceValue)
        ? wethBalanceValue.toFixed(4)
        : "--"
  const ethBalanceValue = Number(ethBalance.formatted ?? "0")
  const ethBalanceDisplay =
    isAuthenticated && ethBalance.isLoading
      ? "..."
      : isAuthenticated && Number.isFinite(ethBalanceValue)
        ? ethBalanceValue.toFixed(4)
        : "--"

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-4 space-y-6">
      {/* City State Visualization */}
      <Card className="game-card w-full max-w-md p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Avatar className="w-12 h-12 border-2 border-primary">
              <AvatarImage src={avatarUrl} alt={displayName} />
              <AvatarFallback>{avatarFallback}</AvatarFallback>
            </Avatar>
            <div>
              <p className="font-semibold text-foreground">{displayName}</p>
              <p className="text-sm text-muted-foreground">@{username}</p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-xs text-muted-foreground">City Level</p>
            <p className="text-2xl font-bold text-primary">{state.cityLevel}</p>
          </div>
        </div>

        {/* Pixel Art City Visualization */}
        <div className="relative aspect-square w-full bg-gradient-to-b from-muted/50 to-muted rounded-lg overflow-hidden border-2 border-border">
          <div className="absolute inset-0 flex items-center justify-center">
            <img
              src={townAsset.src}
              alt={`Zenempire level ${townAsset.level} town`}
              className="w-full h-full object-contain pixel-art"
              loading="eager"
            />
          </div>
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2">
            <div className="bg-card/90 backdrop-blur-sm px-4 py-2 rounded-full border border-border">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-primary" />
                <span className="font-mono font-semibold text-foreground">{state.zenPower.toFixed(1)} Power</span>
              </div>
            </div>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-muted/50 rounded-lg p-3 text-center">
            <p className="text-xs text-muted-foreground mb-1">Total Sacrifices</p>
            <p className="text-xl font-bold text-foreground">{state.totalSacrifices}</p>
          </div>
          <div className="bg-muted/50 rounded-lg p-3 text-center">
            <p className="text-xs text-muted-foreground mb-1">Temple Burned</p>
            <p className="text-xl font-bold text-primary">{state.stakedZen}</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="bg-muted/50 rounded-lg p-3 text-center">
            <p className="text-xs text-muted-foreground mb-1">ZEN Balance</p>
            <p className="text-xl font-bold text-foreground">{zenBalanceDisplay}</p>
          </div>
          <div className="bg-muted/50 rounded-lg p-3 text-center">
            <p className="text-xs text-muted-foreground mb-1">ETH Balance</p>
            <p className="text-xl font-bold text-foreground">{ethBalanceDisplay}</p>
          </div>
          <div className="bg-muted/50 rounded-lg p-3 text-center">
            <p className="text-xs text-muted-foreground mb-1">WETH Balance</p>
            <p className="text-xl font-bold text-foreground">{wethBalanceDisplay}</p>
          </div>
          <div className="bg-muted/50 rounded-lg p-3 text-center">
            <p className="text-xs text-muted-foreground mb-1">USDC Balance</p>
            <p className="text-xl font-bold text-foreground">{usdcBalanceDisplay}</p>
          </div>
        </div>
      </Card>

      {/* Primary Sacrifice Button */}
      <div className="w-full max-w-md space-y-3">
        <Button
          onClick={isAuthenticated ? handleSacrifice : handleConnect}
          disabled={isPrimaryDisabled}
          className="w-full h-14 text-lg font-bold"
          size="lg"
        >
          {isSending || callId ? (
            <>
              <Loader2 className="w-5 h-5 mr-2 animate-spin" />
              Sacrificing...
            </>
          ) : isAuthLoading || isConnecting ? (
            <>
              <Loader2 className="w-5 h-5 mr-2 animate-spin" />
              Connecting...
            </>
          ) : isAuthenticated ? (
            <>
              <Coins className="w-5 h-5 mr-2" />
              Sacrifice 0.01 ZEN
            </>
          ) : (
            <>
              <Coins className="w-5 h-5 mr-2" />
              Connect Base Account
            </>
          )}
        </Button>
        <p className="text-center text-sm text-muted-foreground">
          {isAuthenticated
            ? "Sacrifice to gain power and grow your empire"
            : "Connect your Base account to enable onchain sacrifices"}
        </p>
        {shouldDisableBurn && (
          <p className="text-center text-xs text-muted-foreground">You need ZEN to burn. Swap first.</p>
        )}
        {authError && !isAuthenticated && (
          <p className="text-center text-xs text-muted-foreground">{authError}</p>
        )}
        <ConnectionDebug />
        <ManifestStatusPanel />
      </div>

      <div className="w-full max-w-md">
        <SwapPanel highlightSwap={highlightSwap} onSwapSuccess={refetchBalances} />
      </div>
    </div>
  )
}
