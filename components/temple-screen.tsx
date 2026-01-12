"use client"

import { useEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { useBaseAuth } from "@/lib/base-auth"
import { BASE_CHAINS, DEFAULT_CHAIN_ID, getPaymasterUrl } from "@/lib/base-config"
import { getNextLevelCost, getTotalBurnedForLevel, useGame } from "@/lib/game-state"
import { BASE_MAINNET_CHAIN_ID, ERC20_ABI, ZEN_BURN_MANAGER_ABI, ZEN_BURN_MANAGER_ADDRESS } from "@/lib/zen-burn"
import { Loader2, Church, TrendingUp, Lock } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { useCallsStatus, useReadContract, useSendCalls, useSwitchChain } from "wagmi"
import { encodeFunctionData, parseUnits } from "viem"

export function TempleScreen() {
  const { address, chainId, isAuthenticated, isConnecting, signIn, error: authError } = useBaseAuth()
  const { state, stakeZen } = useGame()
  const { toast } = useToast()
  const [isAuthLoading, setIsAuthLoading] = useState(false)
  const [burnAmount, setBurnAmount] = useState("")
  const [callId, setCallId] = useState<string | null>(null)
  const pendingAmountRef = useRef<number | null>(null)
  const handledCallIdRef = useRef<string | null>(null)
  const { mutateAsync: sendCallsAsync, isPending: isSending } = useSendCalls()
  const { switchChainAsync, isPending: isSwitching } = useSwitchChain()

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

  const handleConnect = async () => {
    setIsAuthLoading(true)
    try {
      await signIn()
      toast({
        title: "Base Account Connected",
        description: "You're ready to burn ZEN in the Temple.",
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

  const handleBurn = async () => {
    const amountValue = Number.parseFloat(burnAmount)
    if (!amountValue || amountValue <= 0) {
      toast({
        title: "Invalid Amount",
        description: "Please enter a valid ZEN amount",
        variant: "destructive",
      })
      return
    }

    try {
      if (!address || !isAuthenticated) {
        throw new Error("Connect your Base account to continue.")
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
      if (!paymasterUrl) {
        throw new Error("Paymaster proxy must be HTTPS. Set NEXT_PUBLIC_PAYMASTER_PROXY_URL.")
      }

      const decimals = typeof zenDecimals === "number" ? zenDecimals : Number(zenDecimals ?? 18)
      const amount = parseUnits(burnAmount, decimals)
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

      pendingAmountRef.current = amountValue
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
        capabilities: {
          paymasterService: {
            url: paymasterUrl,
            optional: false,
          },
        },
        forceAtomic: true,
        version: "1",
      })

      setCallId(response.id)
    } catch (caughtError) {
      toast({
        title: "Burn Failed",
        description: caughtError instanceof Error ? caughtError.message : "Please try again",
        variant: "destructive",
      })
    }
  }

  useEffect(() => {
    if (!callId || !callsStatus) return
    if (handledCallIdRef.current === callId) return

    if (callsStatus.status === "failure") {
      handledCallIdRef.current = callId
      setCallId(null)
      pendingAmountRef.current = null
      toast({
        title: "Burn Failed",
        description: "The burn transaction did not complete.",
        variant: "destructive",
      })
    }

    if (callsStatus.status === "success" && callsStatus.receipts?.length) {
      const txHash = callsStatus.receipts[callsStatus.receipts.length - 1]?.transactionHash
      handledCallIdRef.current = callId
      setCallId(null)
      const burnedAmount = pendingAmountRef.current ?? 0
      pendingAmountRef.current = null
      stakeZen(burnedAmount)
      setBurnAmount("")

      const shortHash = txHash ? `${txHash.slice(0, 6)}...${txHash.slice(-4)}` : "View in explorer"
      toast({
        title: "Burn Complete!",
        description: `Tx ${shortHash}`,
      })
    }
  }, [callId, callsStatus, stakeZen, toast])

  const currentLevelThreshold = getTotalBurnedForLevel(state.cityLevel)
  const nextLevelThreshold = getTotalBurnedForLevel(state.cityLevel + 1)
  const nextLevelCost = getNextLevelCost(state.cityLevel)
  const progressToNextLevel = Math.min(
    100,
    Math.max(
      0,
      nextLevelThreshold === currentLevelThreshold
        ? 100
        : ((state.stakedZen - currentLevelThreshold) / (nextLevelThreshold - currentLevelThreshold)) * 100,
    ),
  )
  const isPrimaryLoading = isSending || Boolean(callId) || isAuthLoading || isConnecting || isSwitching

  return (
    <div className="flex-1 p-4 space-y-6 max-w-2xl mx-auto">
      <div className="text-center space-y-2 pt-4">
        <div className="flex justify-center mb-4">
          <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
            <Church className="w-8 h-8 text-primary" />
          </div>
        </div>
        <h1 className="text-3xl font-bold text-primary gold-glow">The Temple</h1>
        <p className="text-muted-foreground">Burn ZEN to upgrade your city and unlock divine powers</p>
      </div>

      {/* Current Level Status */}
      <Card className="game-card p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-muted-foreground">Current Level</p>
            <p className="text-4xl font-bold text-primary">{state.cityLevel}</p>
          </div>
          <div className="text-right">
            <p className="text-sm text-muted-foreground">Next Level</p>
            <p className="text-2xl font-bold text-foreground">{state.cityLevel + 1}</p>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Progress</span>
            <span className="font-semibold text-foreground">{progressToNextLevel.toFixed(0)}%</span>
          </div>
          <div className="h-3 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-primary transition-all duration-300"
              style={{ width: `${progressToNextLevel}%` }}
            />
          </div>
          <p className="text-xs text-muted-foreground text-center">
            {state.stakedZen.toFixed(2)} / {nextLevelThreshold.toFixed(2)} ZEN burned · {nextLevelCost.toFixed(2)} ZEN to
            reach Level {state.cityLevel + 1}
          </p>
        </div>
      </Card>

      {/* Burning Interface */}
      <Card className="game-card p-6 space-y-4">
        <div className="space-y-2">
          <label className="text-sm font-semibold text-foreground">Burn ZEN Amount</label>
          <Input
            type="number"
            placeholder="Enter amount..."
            value={burnAmount}
            onChange={(e) => setBurnAmount(e.target.value)}
            className="h-12 text-lg"
            min="0"
            step="0.01"
          />
        </div>

        <Button
          onClick={isAuthenticated ? handleBurn : handleConnect}
          disabled={isPrimaryLoading || !burnAmount}
          className="w-full h-12 text-lg font-semibold"
          size="lg"
        >
          {isSending || callId ? (
            <>
              <Loader2 className="w-5 h-5 mr-2 animate-spin" />
              Burning...
            </>
          ) : isAuthLoading || isConnecting ? (
            <>
              <Loader2 className="w-5 h-5 mr-2 animate-spin" />
              Connecting...
            </>
          ) : isAuthenticated ? (
            <>
              <TrendingUp className="w-5 h-5 mr-2" />
              Burn ZEN
            </>
          ) : (
            <>
              <TrendingUp className="w-5 h-5 mr-2" />
              Connect Base Account
            </>
          )}
        </Button>
        {authError && !isAuthenticated && <p className="text-xs text-muted-foreground text-center">{authError}</p>}
      </Card>

      {/* Level Benefits */}
      <Card className="game-card p-6 space-y-4">
        <h3 className="font-semibold text-lg text-foreground flex items-center gap-2">
          <Lock className="w-5 h-5 text-primary" />
          Upgrade Benefits
        </h3>
        <div className="space-y-3">
          {[
            { level: 2, benefit: "Unlock advanced sacrifice rituals", unlocked: state.cityLevel >= 2 },
            { level: 3, benefit: "Double ZEN power generation", unlocked: state.cityLevel >= 3 },
            { level: 5, benefit: "Access to legendary artifacts", unlocked: state.cityLevel >= 5 },
            { level: 10, benefit: "Become an eternal ruler", unlocked: state.cityLevel >= 10 },
          ].map((item) => (
            <div
              key={item.level}
              className={`flex items-center gap-3 p-3 rounded-lg ${
                item.unlocked ? "bg-primary/10 border border-primary/20" : "bg-muted/50"
              }`}
            >
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center font-bold ${
                  item.unlocked ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                }`}
              >
                {item.level}
              </div>
              <p className={`text-sm ${item.unlocked ? "text-foreground" : "text-muted-foreground"}`}>{item.benefit}</p>
            </div>
          ))}
        </div>
      </Card>
    </div>
  )
}
