"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { ToastAction } from "@/components/ui/toast"
import { useToast } from "@/hooks/use-toast"
import { useBaseAuth } from "@/lib/base-auth"
import { getPaymasterUrl } from "@/lib/base-config"
import {
  AERODROME_CLASSIC_ROUTER_ABI,
  AERODROME_CLASSIC_ROUTER_ADDRESS,
  AERODROME_SLIPSTREAM_ROUTER_ABI,
  AERODROME_SLIPSTREAM_ROUTER_ADDRESS,
  BASE_CHAIN_ID,
  UNISWAP_V3_ROUTER_ABI,
  UNISWAP_V3_ROUTER_ADDRESS,
  USDC_ADDRESS,
  WETH_ADDRESS,
  ZEN_TOKEN_ADDRESS,
} from "@/lib/aerodrome"
import { selectBestRoute } from "@/lib/router-selector"
import { useErc20Balance } from "@/lib/use-erc20-balance"
import { ERC20_ABI } from "@/lib/zen-burn"
import { ArrowLeftRight, Loader2, RefreshCcw } from "lucide-react"
import { encodeFunctionData, parseUnits } from "viem"
import { useCallsStatus, usePublicClient, useReadContract, useSendCalls, useSendTransaction, useSwitchChain } from "wagmi"

const DEFAULT_ETH_AMOUNT = "0.001"
const DEFAULT_WETH_AMOUNT = "0.001"
const DEFAULT_USDC_AMOUNT = "1"
const SLIPPAGE_BPS = 100n

const getDeadline = () => BigInt(Math.floor(Date.now() / 1000) + 60 * 10)

const formatTxHash = (hash?: `0x${string}`) =>
  hash ? `${hash.slice(0, 6)}...${hash.slice(-4)}` : "View in explorer"

const applySlippage = (amountOut: bigint) => (amountOut * (10_000n - SLIPPAGE_BPS)) / 10_000n

export function SwapPanel({
  highlightSwap,
  onSwapSuccess,
}: {
  highlightSwap: boolean
  onSwapSuccess?: () => void
}) {
  const { address, chainId, isAuthenticated, isConnecting, signIn } = useBaseAuth()
  const { toast } = useToast()
  const publicClient = usePublicClient({ chainId: BASE_CHAIN_ID })
  const { switchChainAsync, isPending: isSwitching } = useSwitchChain()
  const { mutateAsync: sendCallsAsync, isPending: isSending } = useSendCalls()
  const { sendTransactionAsync } = useSendTransaction()

  const [ethAmount, setEthAmount] = useState(DEFAULT_ETH_AMOUNT)
  const [wethAmount, setWethAmount] = useState(DEFAULT_WETH_AMOUNT)
  const [usdcAmount, setUsdcAmount] = useState(DEFAULT_USDC_AMOUNT)
  const [pendingSwapId, setPendingSwapId] = useState<string | null>(null)
  const [activeSwap, setActiveSwap] = useState<"eth" | "weth" | "usdc" | null>(null)
  const handledSwapIdRef = useRef<string | null>(null)

  const { data: callsStatus } = useCallsStatus({
    id: pendingSwapId ?? "",
    query: {
      enabled: Boolean(pendingSwapId),
      refetchInterval: pendingSwapId ? 2000 : false,
    },
  })

  const { data: usdcDecimals } = useReadContract({
    address: USDC_ADDRESS,
    abi: ERC20_ABI,
    functionName: "decimals",
    chainId: BASE_CHAIN_ID,
  })

  const usdcBalance = useErc20Balance({
    token: USDC_ADDRESS,
    address: address as `0x${string}` | null,
    chainId: BASE_CHAIN_ID,
    enabled: Boolean(isAuthenticated && address),
  })

  const wethBalance = useErc20Balance({
    token: WETH_ADDRESS,
    address: address as `0x${string}` | null,
    chainId: BASE_CHAIN_ID,
    enabled: Boolean(isAuthenticated && address),
  })

  const decimals = useMemo(
    () => (typeof usdcDecimals === "number" ? usdcDecimals : Number(usdcDecimals ?? 6)),
    [usdcDecimals],
  )

  const isSwapLoading = isSending || Boolean(pendingSwapId) || isSwitching || isConnecting

  const ensureBaseNetwork = async () => {
    const activeChainId = chainId ?? BASE_CHAIN_ID
    if (activeChainId !== BASE_CHAIN_ID) {
      await switchChainAsync({ chainId: BASE_CHAIN_ID })
      throw new Error("Switching to Base mainnet. Please try again.")
    }
    return activeChainId
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

  const executeSwap = async ({
    amountIn,
    tokenIn,
    tokenOut,
    isEth,
  }: {
    amountIn: bigint
    tokenIn: `0x${string}`
    tokenOut: `0x${string}`
    isEth: boolean
  }) => {
    if (!publicClient) {
      throw new Error("RPC not ready.")
    }

    const routeChoice = await selectBestRoute({
      publicClient,
      amountIn,
      tokenIn,
      tokenOut,
    })

    if (!routeChoice) {
      throw new Error("No liquid route found. Try again later.")
    }

    const amountOutMin = applySlippage(routeChoice.amountOut)
    const deadline = getDeadline()

    if (routeChoice.mode === "slipstream") {
      const params = {
        tokenIn,
        tokenOut,
        fee: routeChoice.fee,
        recipient: address as `0x${string}`,
        deadline,
        amountIn,
        amountOutMinimum: amountOutMin,
        sqrtPriceLimitX96: 0n,
      }

      return {
        router: routeChoice.router ?? AERODROME_SLIPSTREAM_ROUTER_ADDRESS,
        data: encodeFunctionData({
          abi: AERODROME_SLIPSTREAM_ROUTER_ABI,
          functionName: "exactInputSingle",
          args: [params],
        }),
        value: isEth ? amountIn : 0n,
      }
    }

    if (routeChoice.mode === "uniswap") {
      const params = {
        tokenIn,
        tokenOut,
        fee: routeChoice.fee,
        recipient: address as `0x${string}`,
        deadline,
        amountIn,
        amountOutMinimum: amountOutMin,
        sqrtPriceLimitX96: 0n,
      }

      return {
        router: routeChoice.router ?? UNISWAP_V3_ROUTER_ADDRESS,
        data: encodeFunctionData({
          abi: UNISWAP_V3_ROUTER_ABI,
          functionName: "exactInputSingle",
          args: [params],
        }),
        value: isEth ? amountIn : 0n,
      }
    }

    const routes = routeChoice.routes
    if (isEth) {
      return {
        router: routeChoice.router ?? AERODROME_CLASSIC_ROUTER_ADDRESS,
        data: encodeFunctionData({
          abi: AERODROME_CLASSIC_ROUTER_ABI,
          functionName: "swapExactETHForTokens",
          args: [amountOutMin, routes, address as `0x${string}`, deadline],
        }),
        value: amountIn,
      }
    }

    return {
      router: routeChoice.router ?? AERODROME_CLASSIC_ROUTER_ADDRESS,
      data: encodeFunctionData({
        abi: AERODROME_CLASSIC_ROUTER_ABI,
        functionName: "swapExactTokensForTokens",
        args: [amountIn, amountOutMin, routes, address as `0x${string}`, deadline],
      }),
      value: 0n,
    }
  }

  const sendApprovalIfNeeded = async (token: `0x${string}`, spender: `0x${string}`, amount: bigint) => {
    if (!publicClient || !address) return
    const allowance = (await publicClient.readContract({
      address: token,
      abi: ERC20_ABI,
      functionName: "allowance",
      args: [address, spender],
    })) as bigint

    if (allowance >= amount) {
      return null
    }

    return encodeFunctionData({
      abi: ERC20_ABI,
      functionName: "approve",
      args: [spender, amount],
    })
  }

  const handleSwapEth = async () => {
    setActiveSwap("eth")
    try {
      if (!isAuthenticated || !address) {
        await signIn()
        setActiveSwap(null)
        return
      }

      const parsedAmount = Number.parseFloat(ethAmount)
      if (!parsedAmount || parsedAmount <= 0) {
        throw new Error("Enter a valid ETH amount.")
      }

      const activeChainId = await ensureBaseNetwork()
      const amountIn = parseUnits(ethAmount, 18)
      const swapCall = await executeSwap({
        amountIn,
        tokenIn: WETH_ADDRESS,
        tokenOut: ZEN_TOKEN_ADDRESS,
        isEth: true,
      })

      const paymasterUrl = getPaymasterUrl(activeChainId)
      const calls = [
        {
          to: swapCall.router,
          data: swapCall.data,
          value: swapCall.value,
        },
      ]

      try {
        const response = await sendCallsAsync({
          chainId: activeChainId,
          account: address,
          calls,
          capabilities: paymasterUrl
            ? {
                paymasterService: { url: paymasterUrl, optional: false },
              }
            : undefined,
          forceAtomic: true,
          version: "1",
        })
        setPendingSwapId(response.id)
        return
      } catch (error) {
        const message = error instanceof Error ? error.message : ""
        if (!message.includes("wallet_sendCalls") && !message.includes("not supported")) {
          throw error
        }
      }

      const tx = await sendTransactionAsync({
        chainId: activeChainId,
        to: swapCall.router,
        data: swapCall.data,
        value: swapCall.value,
      })
      if (publicClient) {
        await publicClient.waitForTransactionReceipt({ hash: tx })
      }
      handleSwapSuccess(tx)
      setActiveSwap(null)
    } catch (error) {
      handleSwapError(error)
      setActiveSwap(null)
    }
  }

  const handleSwapWeth = async () => {
    setActiveSwap("weth")
    try {
      if (!isAuthenticated || !address) {
        await signIn()
        setActiveSwap(null)
        return
      }

      const parsedAmount = Number.parseFloat(wethAmount)
      if (!parsedAmount || parsedAmount <= 0) {
        throw new Error("Enter a valid WETH amount.")
      }

      const activeChainId = await ensureBaseNetwork()
      const amountIn = parseUnits(wethAmount, 18)
      if (wethBalance.isLoading) {
        throw new Error("WETH balance is still loading. Try again in a moment.")
      }
      if (wethBalance.raw < amountIn) {
        throw new Error(
          `Insufficient WETH in this Base account. Balance: ${wethBalance.formatted}.`,
        )
      }
      const swapCall = await executeSwap({
        amountIn,
        tokenIn: WETH_ADDRESS,
        tokenOut: ZEN_TOKEN_ADDRESS,
        isEth: false,
      })

      const approvalData = await sendApprovalIfNeeded(WETH_ADDRESS, swapCall.router, amountIn)
      const paymasterUrl = getPaymasterUrl(activeChainId)
      const calls = [
        ...(approvalData
          ? [
              {
                to: WETH_ADDRESS,
                data: approvalData,
              },
            ]
          : []),
        {
          to: swapCall.router,
          data: swapCall.data,
        },
      ]

      try {
        const response = await sendCallsAsync({
          chainId: activeChainId,
          account: address,
          calls,
          capabilities: paymasterUrl
            ? {
                paymasterService: { url: paymasterUrl, optional: false },
              }
            : undefined,
          forceAtomic: true,
          version: "1",
        })
        setPendingSwapId(response.id)
        return
      } catch (error) {
        const message = error instanceof Error ? error.message : ""
        if (!message.includes("wallet_sendCalls") && !message.includes("not supported")) {
          throw error
        }
      }

      if (approvalData) {
        const approvalTx = await sendTransactionAsync({
          chainId: activeChainId,
          to: WETH_ADDRESS,
          data: approvalData,
        })
        if (publicClient) {
          await publicClient.waitForTransactionReceipt({ hash: approvalTx })
        }
      }

      const swapTx = await sendTransactionAsync({
        chainId: activeChainId,
        to: swapCall.router,
        data: swapCall.data,
      })
      if (publicClient) {
        await publicClient.waitForTransactionReceipt({ hash: swapTx })
      }
      handleSwapSuccess(swapTx)
      setActiveSwap(null)
    } catch (error) {
      handleSwapError(error)
      setActiveSwap(null)
    }
  }

  const handleSwapUsdc = async () => {
    setActiveSwap("usdc")
    try {
      if (!isAuthenticated || !address) {
        await signIn()
        setActiveSwap(null)
        return
      }

      const parsedAmount = Number.parseFloat(usdcAmount)
      if (!parsedAmount || parsedAmount <= 0) {
        throw new Error("Enter a valid USDC amount.")
      }

      const activeChainId = await ensureBaseNetwork()
      const amountIn = parseUnits(usdcAmount, decimals)
      if (usdcBalance.isLoading) {
        throw new Error("USDC balance is still loading. Try again in a moment.")
      }
      if (usdcBalance.raw < amountIn) {
        throw new Error(
          `Insufficient USDC in this Base account. Balance: ${usdcBalance.formatted}.`,
        )
      }
      const swapCall = await executeSwap({
        amountIn,
        tokenIn: USDC_ADDRESS,
        tokenOut: ZEN_TOKEN_ADDRESS,
        isEth: false,
      })

      const approvalData = await sendApprovalIfNeeded(USDC_ADDRESS, swapCall.router, amountIn)
      const paymasterUrl = getPaymasterUrl(activeChainId)
      const calls = [
        ...(approvalData
          ? [
              {
                to: USDC_ADDRESS,
                data: approvalData,
              },
            ]
          : []),
        {
          to: swapCall.router,
          data: swapCall.data,
        },
      ]

      try {
        const response = await sendCallsAsync({
          chainId: activeChainId,
          account: address,
          calls,
          capabilities: paymasterUrl
            ? {
                paymasterService: { url: paymasterUrl, optional: false },
              }
            : undefined,
          forceAtomic: true,
          version: "1",
        })
        setPendingSwapId(response.id)
        return
      } catch (error) {
        const message = error instanceof Error ? error.message : ""
        if (!message.includes("wallet_sendCalls") && !message.includes("not supported")) {
          throw error
        }
      }

      if (approvalData) {
        const approvalTx = await sendTransactionAsync({
          chainId: activeChainId,
          to: USDC_ADDRESS,
          data: approvalData,
        })
        if (publicClient) {
          await publicClient.waitForTransactionReceipt({ hash: approvalTx })
        }
      }

      const swapTx = await sendTransactionAsync({
        chainId: activeChainId,
        to: swapCall.router,
        data: swapCall.data,
      })
      if (publicClient) {
        await publicClient.waitForTransactionReceipt({ hash: swapTx })
      }
      handleSwapSuccess(swapTx)
      setActiveSwap(null)
    } catch (error) {
      handleSwapError(error)
      setActiveSwap(null)
    }
  }

  const isSwapDisabled = isSwapLoading || !publicClient

  useEffect(() => {
    if (!pendingSwapId || !callsStatus) return
    if (handledSwapIdRef.current === pendingSwapId) return

    if (callsStatus.status === "failure") {
      handledSwapIdRef.current = pendingSwapId
      setPendingSwapId(null)
      setActiveSwap(null)
      handleSwapError(new Error("The swap transaction failed."))
      return
    }

    if (callsStatus.status === "success" && callsStatus.receipts?.length) {
      handledSwapIdRef.current = pendingSwapId
      setPendingSwapId(null)
      setActiveSwap(null)
      const txHash = callsStatus.receipts[callsStatus.receipts.length - 1]?.transactionHash
      handleSwapSuccess(txHash)
    }
  }, [callsStatus, pendingSwapId, handleSwapError, handleSwapSuccess])

  return (
    <Card className="game-card w-full max-w-md p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-lg text-foreground">Swap to ZEN</h3>
          <p className="text-xs text-muted-foreground">Powered by Aerodrome</p>
        </div>
        <RefreshCcw className="w-4 h-4 text-muted-foreground" />
      </div>

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
          <Button
            onClick={handleSwapEth}
            disabled={isSwapDisabled}
            className="w-full h-12 text-base font-semibold"
            size="lg"
            variant={highlightSwap ? "default" : "outline"}
          >
            {activeSwap === "eth" ? (
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
          <label className="text-xs font-semibold text-muted-foreground">WETH Amount</label>
          <Input
            type="number"
            min="0"
            step="0.0001"
            value={wethAmount}
            onChange={(event) => setWethAmount(event.target.value)}
            className="h-11"
          />
          <Button
            onClick={handleSwapWeth}
            disabled={isSwapDisabled}
            className="w-full h-12 text-base font-semibold"
            size="lg"
            variant={highlightSwap ? "default" : "outline"}
          >
            {activeSwap === "weth" ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Swapping WETH...
              </>
            ) : (
              <>
                <ArrowLeftRight className="w-4 h-4 mr-2" />
                Swap WETH to ZEN
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
          <Button
            onClick={handleSwapUsdc}
            disabled={isSwapDisabled}
            className="w-full h-12 text-base font-semibold"
            size="lg"
            variant={highlightSwap ? "default" : "outline"}
          >
            {activeSwap === "usdc" ? (
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
      </div>
    </Card>
  )
}
