"use client"

import { useCallback, useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { useBaseAuth } from "@/lib/base-auth"
import { BASE_MAINNET_CHAIN_ID } from "@/lib/base-config"
import { BURNER_ABI, CONTRACTS, ERC20_ABI } from "@/lib/contracts"
import { useErc20Balance } from "@/lib/use-erc20-balance"
import { Loader2, Church, TrendingUp } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { usePublicClient, useReadContract, useSendTransaction, useSwitchChain } from "wagmi"
import { encodeFunctionData, formatUnits, parseUnits } from "viem"
import { ConnectionDebug } from "@/components/connection-debug"
import { ManifestStatusPanel } from "@/components/manifest-status"

export function TempleScreen() {
  const { address, chainId, isAuthenticated, isConnecting, signIn, error: authError } = useBaseAuth()
  const { toast } = useToast()
  const publicClient = usePublicClient({ chainId: BASE_MAINNET_CHAIN_ID })
  const { sendTransactionAsync, isPending: isTxPending } = useSendTransaction()
  const { switchChainAsync, isPending: isSwitching } = useSwitchChain()

  const [burnAmount, setBurnAmount] = useState("")
  const [isBurning, setIsBurning] = useState(false)

  const zenBalance = useErc20Balance({
    token: CONTRACTS.ZEN,
    address,
    chainId: BASE_MAINNET_CHAIN_ID,
    enabled: Boolean(address),
  })

  const rhinoBalance = useErc20Balance({
    token: CONTRACTS.RHINO,
    address,
    chainId: BASE_MAINNET_CHAIN_ID,
    enabled: Boolean(address),
  })

  const { data: currentRate } = useReadContract({
    address: CONTRACTS.BURNER,
    abi: BURNER_ABI,
    functionName: "currentRate",
    chainId: BASE_MAINNET_CHAIN_ID,
    query: {
      enabled: Boolean(isAuthenticated),
      refetchInterval: 20000,
    },
  })

  const rateDisplay = useMemo(() => {
    if (!currentRate) return "--"
    try {
      return formatUnits(currentRate as bigint, 18)
    } catch {
      return "--"
    }
  }, [currentRate])

  const formatTokenValue = (raw: bigint, decimals: number) => {
    try {
      const value = Number(formatUnits(raw, decimals))
      if (!Number.isFinite(value)) return "--"
      return value.toLocaleString(undefined, { maximumFractionDigits: 4 })
    } catch {
      return "--"
    }
  }

  const ensureBaseNetwork = async () => {
    const activeChainId = chainId ?? BASE_MAINNET_CHAIN_ID
    if (activeChainId !== BASE_MAINNET_CHAIN_ID) {
      await switchChainAsync({ chainId: BASE_MAINNET_CHAIN_ID })
      throw new Error("Switching to Base mainnet. Please try again.")
    }
    return BASE_MAINNET_CHAIN_ID
  }

  const ensureAllowance = useCallback(
    async (amount: bigint) => {
      if (!publicClient || !address) {
        throw new Error("RPC not ready.")
      }

      const allowance = (await publicClient.readContract({
        address: CONTRACTS.ZEN,
        abi: ERC20_ABI,
        functionName: "allowance",
        args: [address, CONTRACTS.BURNER],
      })) as bigint

      if (allowance >= amount) {
        return
      }

      const approvalTx = await sendTransactionAsync({
        chainId: BASE_MAINNET_CHAIN_ID,
        account: address,
        to: CONTRACTS.ZEN,
        data: encodeFunctionData({
          abi: ERC20_ABI,
          functionName: "approve",
          args: [CONTRACTS.BURNER, amount],
        }),
      })
      await publicClient.waitForTransactionReceipt({ hash: approvalTx })
    },
    [address, publicClient, sendTransactionAsync],
  )

  const handleConnect = async () => {
    try {
      await signIn("coinbase")
    } catch {
      // Auth error surfaced via authError.
    }
  }

  const handleBurn = async () => {
    const amountValue = Number.parseFloat(burnAmount)
    if (!amountValue || amountValue <= 0) {
      toast({
        title: "Invalid Amount",
        description: "Please enter a valid ZEN amount.",
        variant: "destructive",
      })
      return
    }

    setIsBurning(true)
    try {
      if (!address || !isAuthenticated) {
        await handleConnect()
        return
      }

      const decimals = zenBalance.decimals ?? 18
      const amountRaw = parseUnits(burnAmount, decimals)

      if (zenBalance.isLoading) {
        throw new Error("ZEN balance is still loading.")
      }

      if (zenBalance.raw < amountRaw) {
        throw new Error("You need ZEN to burn. Swap first.")
      }

      await ensureBaseNetwork()
      await ensureAllowance(amountRaw)

      const burnTx = await sendTransactionAsync({
        chainId: BASE_MAINNET_CHAIN_ID,
        account: address,
        to: CONTRACTS.BURNER,
        data: encodeFunctionData({
          abi: BURNER_ABI,
          functionName: "burnZen",
          args: [amountRaw],
        }),
      })

      if (publicClient) {
        await publicClient.waitForTransactionReceipt({ hash: burnTx })
      }

      setBurnAmount("")
      zenBalance.refetch()
      rhinoBalance.refetch()
      toast({
        title: "Burn Complete!",
        description: "RHINO minted to your wallet.",
      })
    } catch (caughtError) {
      toast({
        title: "Burn Failed",
        description: caughtError instanceof Error ? caughtError.message : "Please try again.",
        variant: "destructive",
      })
    } finally {
      setIsBurning(false)
    }
  }

  const isPrimaryLoading = isBurning || isTxPending || isConnecting || isSwitching
  const isOnBase = !chainId || chainId === BASE_MAINNET_CHAIN_ID

  return (
    <div className="flex-1 p-4 space-y-6 max-w-2xl mx-auto">
      <div className="text-center space-y-2 pt-4">
        <div className="flex justify-center mb-4">
          <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
            <Church className="w-8 h-8 text-primary" />
          </div>
        </div>
        <h1 className="text-3xl font-bold text-primary gold-glow">The Temple</h1>
        <p className="text-muted-foreground">Burn ZEN to mint RHINO on Base mainnet</p>
      </div>

      <Card className="game-card p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-muted-foreground">Current Burn Rate</p>
            <p className="text-2xl font-bold text-primary">{rateDisplay} RHINO / ZEN</p>
          </div>
          <div className="text-right">
            <p className="text-sm text-muted-foreground">RHINO Balance</p>
            <p className="text-2xl font-bold text-foreground">
              {rhinoBalance.isLoading ? "..." : formatTokenValue(rhinoBalance.raw, rhinoBalance.decimals ?? 18)}
            </p>
          </div>
        </div>
      </Card>

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
          <p className="text-xs text-muted-foreground">
            ZEN Balance: {formatTokenValue(zenBalance.raw, zenBalance.decimals ?? 18)}
          </p>
        </div>

        {!isOnBase && isAuthenticated && (
          <p className="text-xs text-amber-500 text-center">Switch to Base mainnet to burn.</p>
        )}

        <Button
          onClick={isAuthenticated ? handleBurn : handleConnect}
          disabled={isPrimaryLoading || !burnAmount || !isOnBase}
          className="w-full h-12 text-lg font-semibold"
          size="lg"
        >
          {isBurning || isTxPending ? (
            <>
              <Loader2 className="w-5 h-5 mr-2 animate-spin" />
              Burning...
            </>
          ) : isConnecting ? (
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
        <ConnectionDebug />
        <ManifestStatusPanel />
      </Card>
    </div>
  )
}
