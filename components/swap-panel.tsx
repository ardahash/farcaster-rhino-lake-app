"use client"

import { useEffect, useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { ToastAction } from "@/components/ui/toast"
import { useToast } from "@/hooks/use-toast"
import { useBaseAuth } from "@/lib/base-auth"
import { USDC_ADDRESS, ZEN_TOKEN_ADDRESS } from "@/lib/aerodrome"
import { useErc20Balance, useNativeBalance } from "@/lib/use-erc20-balance"
import { BASE_MAINNET_CHAIN_ID, ERC20_ABI } from "@/lib/zen-burn"
import { ArrowLeftRight, Loader2, RefreshCcw } from "lucide-react"
import { encodeFunctionData, parseUnits, type Address, type Hex } from "viem"
import { usePublicClient, useSendTransaction, useSwitchChain } from "wagmi"

const DEFAULT_ETH_AMOUNT = "0.001"
const DEFAULT_USDC_AMOUNT = "1"
const SLIPPAGE_BPS = 100
const PERMIT2_ADDRESS = "0x000000000022D473030F116dDEE9F6B43aC78BA3"
const NATIVE_ETH_ADDRESS = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE" as Address
const BAR_TOKEN_ADDRESS = "0x1637b8c1Fba28E99776229DF6a7D9f5213E20b07" as Address

type SwapQuoteIssueAllowance = {
  currentAllowance: string
  spender: Address
}

type SwapQuoteIssueBalance = {
  token: Address
  currentBalance: string
  requiredBalance: string
}

type SwapQuoteResponse = {
  liquidityAvailable: boolean
  network?: string
  toToken?: Address
  fromToken?: Address
  fromAmount?: string
  toAmount?: string
  minToAmount?: string
  blockNumber?: string
  fees?: {
    gasFee?: { amount: string; token: Address }
    protocolFee?: { amount: string; token: Address }
  }
  issues?: {
    allowance?: SwapQuoteIssueAllowance
    balance?: SwapQuoteIssueBalance
    simulationIncomplete?: boolean
  }
  transaction?: {
    to: Address
    data: Hex
    value: string
    gas: string
    gasPrice: string
  }
  permit2?: {
    eip712: {
      domain: Record<string, unknown>
      types: Record<string, unknown>
      primaryType: string
      message: Record<string, unknown>
    }
  }
  error?: string
}

const formatTxHash = (hash?: `0x${string}`) =>
  hash ? `${hash.slice(0, 6)}...${hash.slice(-4)}` : "View in explorer"

const toBigInt = (value?: string) => {
  if (!value) return undefined
  try {
    return BigInt(value)
  } catch {
    return undefined
  }
}

export function SwapPanel({
  highlightSwap,
  onSwapSuccess,
}: {
  highlightSwap: boolean
  onSwapSuccess?: () => void
}) {
  const { address, chainId, isAuthenticated, isConnecting, signIn } = useBaseAuth()
  const { toast } = useToast()
  const publicClient = usePublicClient({ chainId: BASE_MAINNET_CHAIN_ID })
  const { switchChainAsync, isPending: isSwitching } = useSwitchChain()
  const { sendTransactionAsync, isPending: isTxPending } = useSendTransaction()

  const [ethAmount, setEthAmount] = useState(DEFAULT_ETH_AMOUNT)
  const [usdcAmount, setUsdcAmount] = useState(DEFAULT_USDC_AMOUNT)
  const [barAmount, setBarAmount] = useState("1000")
  const [activeSwap, setActiveSwap] = useState<"eth-zen" | "usdc-zen" | "eth-bar" | "bar-eth" | null>(null)

  const usdcBalance = useErc20Balance({
    token: USDC_ADDRESS,
    address: address as `0x${string}` | null,
    chainId: BASE_MAINNET_CHAIN_ID,
    enabled: Boolean(isAuthenticated && address),
  })

  const zenBalance = useErc20Balance({
    token: ZEN_TOKEN_ADDRESS,
    address: address as `0x${string}` | null,
    chainId: BASE_MAINNET_CHAIN_ID,
    enabled: Boolean(isAuthenticated && address),
  })

  const barBalance = useErc20Balance({
    token: BAR_TOKEN_ADDRESS,
    address: address as `0x${string}` | null,
    chainId: BASE_MAINNET_CHAIN_ID,
    enabled: Boolean(isAuthenticated && address),
  })

  const ethBalance = useNativeBalance({
    address: address as `0x${string}` | null,
    chainId: BASE_MAINNET_CHAIN_ID,
    enabled: Boolean(isAuthenticated && address),
  })

  const usdcDecimals = useMemo(
    () => (typeof usdcBalance.decimals === "number" ? usdcBalance.decimals : Number(usdcBalance.decimals ?? 6)),
    [usdcBalance.decimals],
  )

  const formatBalance = (value: string, isLoading: boolean) => {
    if (!isAuthenticated) return "--"
    if (isLoading) return "..."
    const numeric = Number(value)
    return Number.isFinite(numeric) ? numeric.toFixed(4) : "--"
  }

  const zenBalanceDisplay = formatBalance(zenBalance.formatted, zenBalance.isLoading)
  const ethBalanceDisplay = formatBalance(ethBalance.formatted, ethBalance.isLoading)
  const barBalanceDisplay = formatBalance(barBalance.formatted, barBalance.isLoading)
  const usdcBalanceDisplay = formatBalance(usdcBalance.formatted, usdcBalance.isLoading)

  const isSwapLoading = isTxPending || isSwitching || isConnecting
  const isOnBase = !chainId || chainId === BASE_MAINNET_CHAIN_ID

  const ensureBaseNetwork = async () => {
    const activeChainId = chainId ?? BASE_MAINNET_CHAIN_ID
    if (activeChainId !== BASE_MAINNET_CHAIN_ID) {
      await switchChainAsync({ chainId: BASE_MAINNET_CHAIN_ID })
      throw new Error("Switching to Base mainnet. Please try again.")
    }
    return BASE_MAINNET_CHAIN_ID
  }

  const handleCopy = async (hash: `0x${string}`) => {
    try {
      await navigator.clipboard.writeText(hash)
    } catch {
      // Swallow clipboard errors.
    }
  }

  const handleSwapSuccess = (hash?: `0x${string}`) => {
    if (onSwapSuccess) {
      onSwapSuccess()
    }
    if (!hash) {
      toast({
        title: "Swap Submitted",
        description: "Your swap was submitted.",
      })
      return
    }
    toast({
      title: "Swap Complete",
      description: `Tx ${formatTxHash(hash)}`,
      action: (
        <ToastAction altText="Copy transaction hash" onClick={() => handleCopy(hash)}>
          Copy
        </ToastAction>
      ),
    })
  }

  const handleSwapError = (error: unknown) => {
    const message =
      error instanceof Error
        ? error.message.replace("user rejected transaction", "Signature rejected.")
        : "Swap failed."
    toast({
      title: "Swap Failed",
      description: message,
      variant: "destructive",
    })
  }

  const fetchSwapQuote = async (payload: {
    fromToken: Address
    toToken: Address
    fromAmount: string
    taker: Address
    slippageBps: number
  }) => {
    const response = await fetch("/api/swap-quote", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    })
    const data = (await response.json()) as SwapQuoteResponse
    if (!response.ok) {
      throw new Error(data.error ?? "Failed to fetch swap quote.")
    }
    return data
  }

  const sendApprovalIfNeeded = async (token: Address, spender: Address, amount: bigint) => {
    if (token.toLowerCase() === NATIVE_ETH_ADDRESS.toLowerCase()) {
      return
    }
    if (!publicClient || !address) return
    const allowance = (await publicClient.readContract({
      address: token,
      abi: ERC20_ABI,
      functionName: "allowance",
      args: [address, spender],
    })) as bigint

    if (allowance >= amount) {
      return
    }

    const approvalTx = await sendTransactionAsync({
      chainId: BASE_MAINNET_CHAIN_ID,
      account: address,
      to: token,
      data: encodeFunctionData({
        abi: ERC20_ABI,
        functionName: "approve",
        args: [spender, amount],
      }),
    })
    await publicClient.waitForTransactionReceipt({ hash: approvalTx })
  }

  const executeSwap = async ({
    amount,
    decimals,
    tokenIn,
    tokenOut,
    swapKey,
    balanceRaw,
    balanceLoading,
    balanceLabel,
  }: {
    amount: string
    decimals: number
    tokenIn: Address
    tokenOut: Address
    swapKey: "eth-zen" | "usdc-zen" | "eth-bar" | "bar-eth"
    balanceRaw: bigint
    balanceLoading: boolean
    balanceLabel: string
  }) => {
    setActiveSwap(swapKey)
    try {
      if (!isAuthenticated || !address) {
        await signIn()
        setActiveSwap(null)
        return
      }

      if (!isOnBase) {
        await ensureBaseNetwork()
        setActiveSwap(null)
        return
      }

      const parsedAmount = Number.parseFloat(amount)
      if (!parsedAmount || parsedAmount <= 0) {
        throw new Error("Enter a valid amount.")
      }

      if (balanceLoading) {
        throw new Error(`${balanceLabel} balance is still loading.`)
      }

      const amountIn = parseUnits(amount, decimals)
      if (balanceRaw < amountIn) {
        throw new Error(`Insufficient ${balanceLabel} in this Base account.`)
      }

      const activeChainId = await ensureBaseNetwork()
      const payload = {
        fromToken: tokenIn,
        toToken: tokenOut,
        fromAmount: amountIn.toString(),
        taker: address,
        slippageBps: SLIPPAGE_BPS,
      }

      console.info("[swap] quote request", {
        chainId: activeChainId,
        address,
        fromToken: tokenIn,
        toToken: tokenOut,
        fromAmount: payload.fromAmount,
        slippageBps: SLIPPAGE_BPS,
      })

      let quote = await fetchSwapQuote(payload)

      console.info("[swap] quote response", quote)

      if (!quote.liquidityAvailable) {
        throw new Error("No liquid route found. Try again later.")
      }

      if (!quote.transaction) {
        throw new Error("Swap transaction unavailable.")
      }

      if (quote.issues?.balance) {
        throw new Error("Insufficient balance for this swap.")
      }

      if (quote.issues?.simulationIncomplete) {
        console.warn("[swap] simulation incomplete", quote.issues)
      }

      if (quote.issues?.allowance) {
        const spender = quote.issues.allowance.spender ?? PERMIT2_ADDRESS
        await sendApprovalIfNeeded(tokenIn, spender, amountIn)
      }

      if (quote.permit2?.eip712) {
        const refreshedQuote = await fetchSwapQuote(payload)
        if (refreshedQuote.liquidityAvailable && refreshedQuote.transaction) {
          quote = refreshedQuote
        }
        if (quote.permit2?.eip712) {
          console.warn("[swap] permit2 present, proceeding with approval-based swap")
        }
      }

      const txData = quote.transaction.data as Hex

      const txRequest = {
        chainId: BASE_MAINNET_CHAIN_ID,
        account: address,
        to: quote.transaction.to,
        data: txData,
        value: toBigInt(quote.transaction.value) ?? 0n,
        gas: toBigInt(quote.transaction.gas),
        gasPrice: toBigInt(quote.transaction.gasPrice),
      }

      console.info("[swap] transaction request", txRequest)

      const txHash = await sendTransactionAsync(txRequest)
      if (publicClient) {
        await publicClient.waitForTransactionReceipt({ hash: txHash })
      }
      handleSwapSuccess(txHash)
      setActiveSwap(null)
    } catch (error) {
      handleSwapError(error)
      setActiveSwap(null)
    }
  }

  const shouldLogBalances =
    typeof window !== "undefined" && window.location.search.toLowerCase().includes("debugbalances=1")

  useEffect(() => {
    if (!shouldLogBalances || !address) return
    if (ethBalance.isLoading || usdcBalance.isLoading || barBalance.isLoading) return
    console.info("[balances]", {
      address,
      chainId: BASE_MAINNET_CHAIN_ID,
      eth: ethBalance.formatted,
      usdc: usdcBalance.formatted,
      zen: zenBalance.formatted,
      bar: barBalance.formatted,
    })
  }, [
    address,
    ethBalance.formatted,
    ethBalance.isLoading,
    shouldLogBalances,
    barBalance.formatted,
    barBalance.isLoading,
    usdcBalance.formatted,
    usdcBalance.isLoading,
    zenBalance.formatted,
  ])

  const isSwapDisabled = isSwapLoading || !publicClient || !isOnBase

  return (
    <Card className="game-card w-full max-w-md p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-lg text-foreground">Swap to ZEN</h3>
          <p className="text-xs text-muted-foreground">Powered by CDP Trade API</p>
          <p className="text-xs text-muted-foreground">Base mainnet swaps only</p>
          <p className="text-xs text-muted-foreground">ZEN Balance: {zenBalanceDisplay}</p>
          <p className="text-xs text-muted-foreground">BAR Balance: {barBalanceDisplay}</p>
        </div>
        <RefreshCcw className="w-4 h-4 text-muted-foreground" />
      </div>

      {!isOnBase && isAuthenticated && (
        <p className="text-xs text-amber-500">Switch to Base mainnet to fetch balances and swap.</p>
      )}

      <div className="space-y-3">
        <div className="space-y-2">
          <label className="text-xs font-semibold text-muted-foreground">ETH Amount</label>
          <Input
            type="number"
            min="0"
            step="0.0001"
            value={ethAmount}
            onChange={(event) => setEthAmount(event.target.value)}
            className="h-11"
          />
          <p className="text-xs text-muted-foreground">Balance: {ethBalanceDisplay}</p>
          <Button
            onClick={() =>
              executeSwap({
                amount: ethAmount,
                decimals: 18,
                tokenIn: NATIVE_ETH_ADDRESS,
                tokenOut: ZEN_TOKEN_ADDRESS,
                swapKey: "eth-zen",
                balanceRaw: ethBalance.raw,
                balanceLoading: ethBalance.isLoading,
                balanceLabel: "ETH",
              })
            }
            disabled={isSwapDisabled}
            className="w-full h-12 text-base font-semibold"
            size="lg"
            variant={highlightSwap ? "default" : "outline"}
          >
            {activeSwap === "eth-zen" ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Swapping ETH...
              </>
            ) : (
              <>
                <ArrowLeftRight className="w-4 h-4 mr-2" />
                Swap ETH to ZEN
              </>
            )}
          </Button>
        </div>

        <div className="space-y-2">
          <label className="text-xs font-semibold text-muted-foreground">USDC Amount</label>
          <Input
            type="number"
            min="0"
            step="0.1"
            value={usdcAmount}
            onChange={(event) => setUsdcAmount(event.target.value)}
            className="h-11"
          />
          <p className="text-xs text-muted-foreground">Balance: {usdcBalanceDisplay}</p>
          <Button
            onClick={() =>
              executeSwap({
                amount: usdcAmount,
                decimals: usdcDecimals,
                tokenIn: USDC_ADDRESS,
                tokenOut: ZEN_TOKEN_ADDRESS,
                swapKey: "usdc-zen",
                balanceRaw: usdcBalance.raw,
                balanceLoading: usdcBalance.isLoading,
                balanceLabel: "USDC",
              })
            }
            disabled={isSwapDisabled}
            className="w-full h-12 text-base font-semibold"
            size="lg"
            variant={highlightSwap ? "default" : "outline"}
          >
            {activeSwap === "usdc-zen" ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Swapping USDC...
              </>
            ) : (
              <>
                <ArrowLeftRight className="w-4 h-4 mr-2" />
                Swap USDC to ZEN
              </>
            )}
          </Button>
        </div>
        <div className="rounded-lg border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
          <p>ETH Balance: {ethBalanceDisplay}</p>
          <p>Swaps route through the best available Base liquidity.</p>
        </div>

        <div className="rounded-lg border border-border bg-muted/40 p-3 text-xs text-muted-foreground space-y-2">
          <p className="font-semibold text-foreground">Get $BAR</p>
          <p>Swap in-app to keep gas sponsorship options open.</p>
          <div className="grid grid-cols-1 gap-2">
            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={() =>
                executeSwap({
                  amount: ethAmount,
                  decimals: 18,
                  tokenIn: NATIVE_ETH_ADDRESS,
                  tokenOut: BAR_TOKEN_ADDRESS,
                  swapKey: "eth-bar",
                  balanceRaw: ethBalance.raw,
                  balanceLoading: ethBalance.isLoading,
                  balanceLabel: "ETH",
                })
              }
              disabled={isSwapDisabled}
            >
              {activeSwap === "eth-bar" ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Swapping ETH...
                </>
              ) : (
                <>
                  <ArrowLeftRight className="w-4 h-4 mr-2" />
                  Swap ETH to BAR
                </>
              )}
            </Button>
            <div className="space-y-2">
              <label className="text-xs font-semibold text-muted-foreground">BAR Amount</label>
              <Input
                type="number"
                min="0"
                step="1"
                value={barAmount}
                onChange={(event) => setBarAmount(event.target.value)}
                className="h-11"
              />
              <p className="text-xs text-muted-foreground">Balance: {barBalanceDisplay}</p>
              <Button
                type="button"
                variant="outline"
                className="w-full"
                onClick={() =>
                  executeSwap({
                    amount: barAmount,
                    decimals: barBalance.decimals ?? 18,
                    tokenIn: BAR_TOKEN_ADDRESS,
                    tokenOut: NATIVE_ETH_ADDRESS,
                    swapKey: "bar-eth",
                    balanceRaw: barBalance.raw,
                    balanceLoading: barBalance.isLoading,
                    balanceLabel: "BAR",
                  })
                }
                disabled={isSwapDisabled}
              >
                {activeSwap === "bar-eth" ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Swapping BAR...
                  </>
                ) : (
                  <>
                    <ArrowLeftRight className="w-4 h-4 mr-2" />
                    Swap BAR to ETH
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </Card>
  )
}
