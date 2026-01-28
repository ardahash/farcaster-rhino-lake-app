"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { ToastAction } from "@/components/ui/toast"
import { useToast } from "@/hooks/use-toast"
import { useBaseAuth } from "@/lib/base-auth"
import { useErc20Balance, useNativeBalance } from "@/lib/use-erc20-balance"
import { BASE_MAINNET_CHAIN_ID } from "@/lib/base-config"
import { CONTRACTS, ERC20_ABI } from "@/lib/contracts"
import { ArrowLeftRight, Loader2, RefreshCcw } from "lucide-react"
import { concat, encodeFunctionData, numberToHex, parseUnits, size, type Address, type Hex } from "viem"
import { usePublicClient, useSendTransaction, useSignTypedData, useSwitchChain } from "wagmi"

const DEFAULT_ETH_AMOUNT = "0.001"
const SLIPPAGE_BPS = 100
const PERMIT2_ADDRESS = "0x000000000022D473030F116dDEE9F6B43aC78BA3"
const NATIVE_ETH_ADDRESS = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE" as Address

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
  highlightSwap = false,
  onSwapSuccess,
}: {
  highlightSwap?: boolean
  onSwapSuccess?: () => void
}) {
  const { address, chainId, isAuthenticated, isConnecting, signIn } = useBaseAuth()
  const { toast } = useToast()
  const publicClient = usePublicClient({ chainId: BASE_MAINNET_CHAIN_ID })
  const { switchChainAsync, isPending: isSwitching } = useSwitchChain()
  const { sendTransactionAsync, isPending: isTxPending } = useSendTransaction()
  const { signTypedDataAsync, isPending: isSigning } = useSignTypedData()

  const [ethBarAmount, setEthBarAmount] = useState(DEFAULT_ETH_AMOUNT)
  const [barAmount, setBarAmount] = useState("1000")
  const [activeSwap, setActiveSwap] = useState<"eth-bar" | "bar-eth" | null>(null)

  const shiftDecimal = (value: string, direction: "up" | "down") => {
    const raw = value.trim()
    if (!raw || raw === ".") return "0"
    let negative = false
    let normalized = raw
    if (normalized.startsWith("-")) {
      negative = true
      normalized = normalized.slice(1)
    }
    if (normalized.startsWith(".")) {
      normalized = `0${normalized}`
    }
    const [intPart = "0", fracPart = ""] = normalized.split(".")
    const digits = `${intPart}${fracPart}`.replace(/^0+(?=\d)/, "") || "0"
    const scale = fracPart.length
    const nextScale = direction === "up" ? scale - 1 : scale + 1

    const formatDecimal = (nextDigits: string, nextScaleValue: number) => {
      let integer = nextDigits
      let fraction = ""
      if (nextScaleValue > 0) {
        if (nextDigits.length > nextScaleValue) {
          const splitAt = nextDigits.length - nextScaleValue
          integer = nextDigits.slice(0, splitAt)
          fraction = nextDigits.slice(splitAt)
        } else {
          integer = "0"
          fraction = `${"0".repeat(nextScaleValue - nextDigits.length)}${nextDigits}`
        }
      } else if (nextScaleValue < 0) {
        integer = `${nextDigits}${"0".repeat(Math.abs(nextScaleValue))}`
      }
      const assembled = fraction ? `${integer}.${fraction}` : integer
      const trimmed = assembled.replace(/\.?0+$/, "")
      const result = trimmed === "" ? "0" : trimmed
      return negative && result !== "0" ? `-${result}` : result
    }

    return formatDecimal(digits, nextScale)
  }

  const heading = "Swap $BAR"

  const barBalance = useErc20Balance({
    token: CONTRACTS.BAR,
    address: address as `0x${string}` | null,
    chainId: BASE_MAINNET_CHAIN_ID,
    enabled: Boolean(isAuthenticated && address),
  })

  const ethBalance = useNativeBalance({
    address: address as `0x${string}` | null,
    chainId: BASE_MAINNET_CHAIN_ID,
    enabled: Boolean(isAuthenticated && address),
  })

  const formatBalance = (value: string, isLoading: boolean) => {
    if (!isAuthenticated) return "--"
    if (isLoading) return "..."
    const numeric = Number(value)
    return Number.isFinite(numeric) ? numeric.toFixed(4) : "--"
  }

  const ethBalanceDisplay = formatBalance(ethBalance.formatted, ethBalance.isLoading)
  const barBalanceDisplay = formatBalance(barBalance.formatted, barBalance.isLoading)

  const isSwapLoading = isTxPending || isSwitching || isConnecting || isSigning
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
    swapKey: "eth-bar" | "bar-eth"
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
      }

      let txData = quote.transaction.data as Hex
      if (quote.permit2?.eip712) {
        const signature = (await signTypedDataAsync({
          domain: quote.permit2.eip712.domain as Record<string, unknown>,
          types: quote.permit2.eip712.types as Record<string, unknown>,
          primaryType: quote.permit2.eip712.primaryType as string,
          message: quote.permit2.eip712.message as Record<string, unknown>,
        })) as Hex
        const signatureLength = numberToHex(size(signature), { signed: false, size: 32 })
        txData = concat([txData, signatureLength, signature])
      }

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
    if (ethBalance.isLoading || barBalance.isLoading) return
    console.info("[balances]", {
      address,
      chainId: BASE_MAINNET_CHAIN_ID,
      eth: ethBalance.formatted,
      bar: barBalance.formatted,
    })
  }, [address, ethBalance.formatted, ethBalance.isLoading, shouldLogBalances, barBalance.formatted, barBalance.isLoading])

  const isSwapDisabled = isSwapLoading || !publicClient || !isOnBase

  return (
    <Card className="game-card w-full max-w-md p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-lg text-foreground">{heading}</h3>
          <p className="text-xs text-muted-foreground">Powered by CDP Trade API</p>
          <p className="text-xs text-muted-foreground">Base mainnet swaps only</p>
          <p className="text-xs text-muted-foreground">BAR Balance: {barBalanceDisplay}</p>
        </div>
        <RefreshCcw className="w-4 h-4 text-muted-foreground" />
      </div>

      {!isOnBase && isAuthenticated && (
        <p className="text-xs text-amber-500">Switch to Base mainnet to fetch balances and swap.</p>
      )}

      <div className="space-y-3">
        <div className="rounded-lg border border-border bg-muted/40 p-3 text-xs text-muted-foreground space-y-2">
          <p className="font-semibold text-foreground">Get $BAR</p>
          <p>Swap in-app to keep gas sponsorship options open.</p>
          <div className="grid grid-cols-1 gap-2">
            <div className="space-y-2">
              <label className="text-xs font-semibold text-muted-foreground">ETH Amount</label>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="icon-sm"
                  onClick={() => setEthBarAmount((prev) => shiftDecimal(prev, "down"))}
                  aria-label="Decrease ETH amount"
                >
                  -
                </Button>
                <Input
                  type="number"
                  min="0"
                  step="0.0001"
                  value={ethBarAmount}
                  onChange={(event) => setEthBarAmount(event.target.value)}
                  className="h-11 flex-1"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon-sm"
                  onClick={() => setEthBarAmount((prev) => shiftDecimal(prev, "up"))}
                  aria-label="Increase ETH amount"
                >
                  +
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">Balance: {ethBalanceDisplay}</p>
              <Button
                type="button"
                variant={highlightSwap ? "default" : "outline"}
                className="w-full"
                onClick={() =>
                  executeSwap({
                    amount: ethBarAmount,
                    decimals: 18,
                    tokenIn: NATIVE_ETH_ADDRESS,
                    tokenOut: CONTRACTS.BAR,
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
            </div>
            <div className="space-y-2">
              <label className="text-xs font-semibold text-muted-foreground">BAR Amount</label>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="icon-sm"
                  onClick={() => setBarAmount((prev) => shiftDecimal(prev, "down"))}
                  aria-label="Decrease BAR amount"
                >
                  -
                </Button>
                <Input
                  type="number"
                  min="0"
                  step="1"
                  value={barAmount}
                  onChange={(event) => setBarAmount(event.target.value)}
                  className="h-11 flex-1"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon-sm"
                  onClick={() => setBarAmount((prev) => shiftDecimal(prev, "up"))}
                  aria-label="Increase BAR amount"
                >
                  +
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">Balance: {barBalanceDisplay}</p>
              <Button
                type="button"
                variant="outline"
                className="w-full"
                onClick={() =>
                  executeSwap({
                    amount: barAmount,
                    decimals: barBalance.decimals ?? 18,
                    tokenIn: CONTRACTS.BAR,
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
