"use client"

import { useCallback, useState } from "react"
import { useName } from "@coinbase/onchainkit/identity"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { ConnectionDebug } from "@/components/connection-debug"
import { ManifestStatusPanel } from "@/components/manifest-status"
import { SwapPanel } from "@/components/swap-panel"
import { useToast } from "@/hooks/use-toast"
import { useBaseAuth } from "@/lib/base-auth"
import { BASE_MAINNET_CHAIN_ID } from "@/lib/base-config"
import { CONTRACTS, ERC20_ABI, GAME_ABI } from "@/lib/contracts"
import { getTownAssetForLevel } from "@/lib/game-state"
import { useCityId } from "@/hooks/use-city-id"
import { useCityState } from "@/hooks/use-city-state"
import { useErc20Balance, useNativeBalance } from "@/lib/use-erc20-balance"
import { Coins, Loader2, Shield, Sparkles, Swords } from "lucide-react"
import { usePublicClient, useSendTransaction, useSwitchChain } from "wagmi"
import { base } from "wagmi/chains"
import { encodeFunctionData, formatUnits, parseUnits } from "viem"

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

const formatTokenValue = (raw: bigint, decimals: number, fallback = "--") => {
  try {
    const value = Number(formatUnits(raw, decimals))
    if (!Number.isFinite(value)) return fallback
    return value.toLocaleString(undefined, { maximumFractionDigits: 4 })
  } catch {
    return fallback
  }
}

export function HomeScreen() {
  const { address, chainId, isAuthenticated, isConnecting, signIn, error: authError } = useBaseAuth()
  const { toast } = useToast()
  const publicClient = usePublicClient({ chainId: BASE_MAINNET_CHAIN_ID })
  const { sendTransactionAsync, isPending: isTxPending } = useSendTransaction()
  const { switchChainAsync, isPending: isSwitching } = useSwitchChain()

  const { data: resolvedName } = useName({ address, chain: base })
  const { cityId, isLoading: isCityIdLoading, refetch: refetchCityId } = useCityId(address)
  const {
    cityState,
    level,
    ethClaimable,
    isLoading: isCityLoading,
    refetch: refetchCityState,
  } = useCityState(cityId)

  const zenBalance = useErc20Balance({
    token: CONTRACTS.ZEN,
    address,
    chainId: BASE_MAINNET_CHAIN_ID,
    enabled: Boolean(address),
  })

  const barBalance = useErc20Balance({
    token: CONTRACTS.BAR,
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

  const ethBalance = useNativeBalance({
    address,
    chainId: BASE_MAINNET_CHAIN_ID,
    enabled: Boolean(address),
  })

  const [barLockAmount, setBarLockAmount] = useState("")
  const [rhinoLockAmount, setRhinoLockAmount] = useState("")
  const [activeAction, setActiveAction] = useState<"create" | "lock-bar" | "lock-rhino" | null>(null)

  const refetchAll = useCallback(() => {
    zenBalance.refetch()
    barBalance.refetch()
    rhinoBalance.refetch()
    ethBalance.refetch()
    refetchCityId()
    refetchCityState()
  }, [
    barBalance.refetch,
    ethBalance.refetch,
    refetchCityId,
    refetchCityState,
    rhinoBalance.refetch,
    zenBalance.refetch,
  ])

  const ensureBaseNetwork = async () => {
    const activeChainId = chainId ?? BASE_MAINNET_CHAIN_ID
    if (activeChainId !== BASE_MAINNET_CHAIN_ID) {
      await switchChainAsync({ chainId: BASE_MAINNET_CHAIN_ID })
      throw new Error("Switching to Base mainnet. Please try again.")
    }
    return BASE_MAINNET_CHAIN_ID
  }

  const ensureAllowance = async (token: `0x${string}`, spender: `0x${string}`, amount: bigint) => {
    if (!publicClient || !address) {
      throw new Error("RPC not ready.")
    }
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

  const handleConnect = async () => {
    try {
      await signIn("coinbase")
    } catch {
      // Sign-in errors are surfaced by authError.
    }
  }

  const handleCreateCity = async () => {
    setActiveAction("create")
    try {
      if (!isAuthenticated || !address) {
        await handleConnect()
        return
      }

      if (cityId > 0n) {
        throw new Error("City already minted.")
      }

      await ensureBaseNetwork()

      const txHash = await sendTransactionAsync({
        chainId: BASE_MAINNET_CHAIN_ID,
        account: address,
        to: CONTRACTS.GAME,
        data: encodeFunctionData({
          abi: GAME_ABI,
          functionName: "createCity",
        }),
      })
      if (publicClient) {
        await publicClient.waitForTransactionReceipt({ hash: txHash })
      }
      toast({
        title: "City Minted",
        description: "Your city has been created on Base.",
      })
      refetchAll()
    } catch (error) {
      toast({
        title: "Mint Failed",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      })
    } finally {
      setActiveAction(null)
    }
  }

  const handleLockBar = async () => {
    setActiveAction("lock-bar")
    try {
      if (!isAuthenticated || !address) {
        await handleConnect()
        return
      }

      if (cityId <= 0n) {
        throw new Error("Mint a city first.")
      }

      if (cityState.dead) {
        throw new Error("This city is dead and cannot grow.")
      }

      const amountValue = Number.parseFloat(barLockAmount)
      if (!amountValue || amountValue <= 0) {
        throw new Error("Enter a BAR amount to lock.")
      }

      const decimals = barBalance.decimals ?? 18
      const amountRaw = parseUnits(barLockAmount, decimals)

      if (barBalance.isLoading) {
        throw new Error("BAR balance is still loading.")
      }

      if (barBalance.raw < amountRaw) {
        throw new Error("Insufficient BAR balance.")
      }

      await ensureBaseNetwork()
      await ensureAllowance(CONTRACTS.BAR, CONTRACTS.GAME, amountRaw)

      const txHash = await sendTransactionAsync({
        chainId: BASE_MAINNET_CHAIN_ID,
        account: address,
        to: CONTRACTS.GAME,
        data: encodeFunctionData({
          abi: GAME_ABI,
          functionName: "lockBAR",
          args: [cityId, amountRaw],
        }),
      })
      if (publicClient) {
        await publicClient.waitForTransactionReceipt({ hash: txHash })
      }
      toast({
        title: "BAR Locked",
        description: "Your city's power has increased.",
      })
      setBarLockAmount("")
      refetchAll()
    } catch (error) {
      toast({
        title: "Lock Failed",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      })
    } finally {
      setActiveAction(null)
    }
  }

  const handleLockRhino = async () => {
    setActiveAction("lock-rhino")
    try {
      if (!isAuthenticated || !address) {
        await handleConnect()
        return
      }

      if (cityId <= 0n) {
        throw new Error("Mint a city first.")
      }

      if (cityState.dead) {
        throw new Error("This city is dead and cannot fight.")
      }

      const amountValue = Number.parseFloat(rhinoLockAmount)
      if (!amountValue || amountValue <= 0) {
        throw new Error("Enter a RHINO amount to lock.")
      }

      const decimals = rhinoBalance.decimals ?? 18
      const amountRaw = parseUnits(rhinoLockAmount, decimals)

      if (rhinoBalance.isLoading) {
        throw new Error("RHINO balance is still loading.")
      }

      if (rhinoBalance.raw < amountRaw) {
        throw new Error("Insufficient RHINO balance.")
      }

      await ensureBaseNetwork()
      await ensureAllowance(CONTRACTS.RHINO, CONTRACTS.GAME, amountRaw)

      const txHash = await sendTransactionAsync({
        chainId: BASE_MAINNET_CHAIN_ID,
        account: address,
        to: CONTRACTS.GAME,
        data: encodeFunctionData({
          abi: GAME_ABI,
          functionName: "lockRHINO",
          args: [cityId, amountRaw],
        }),
      })
      if (publicClient) {
        await publicClient.waitForTransactionReceipt({ hash: txHash })
      }
      toast({
        title: "RHINO Locked",
        description: "Your city's war power has increased.",
      })
      setRhinoLockAmount("")
      refetchAll()
    } catch (error) {
      toast({
        title: "Lock Failed",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      })
    } finally {
      setActiveAction(null)
    }
  }

  const baseName =
    typeof resolvedName === "string"
      ? resolvedName
      : resolvedName && typeof resolvedName === "object" && "name" in resolvedName
        ? resolvedName.name
        : null
  const baseHandle = baseName ? formatBaseHandle(baseName) : null
  const shortAddress = address ? `${address.slice(0, 6)}...${address.slice(-4)}` : "guest"
  const displayName = isAuthenticated ? (baseHandle ? `@${baseHandle}` : shortAddress) : "Rhino Lake Ruler"
  const username = isAuthenticated ? (baseName?.startsWith("@") ? baseName.slice(1) : baseName ?? shortAddress) : "rhino-lake"
  const avatarUrl = "/rhino-avatar-purple.jpg"
  const avatarFallback = displayName[0] ?? "?"

  const isPrimaryLoading = isTxPending || isConnecting || isSwitching || isCityIdLoading || isCityLoading
  const isOnBase = !chainId || chainId === BASE_MAINNET_CHAIN_ID
  const isActionDisabled = isPrimaryLoading || !isAuthenticated || !isOnBase
  const isCityReady = !isCityIdLoading
  const hasCity = isCityReady && cityId > 0n
  const displayLevel = level > 0 ? level : 1
  const townAsset = getTownAssetForLevel(displayLevel)

  const powerDisplay = formatTokenValue(cityState.barLocked, barBalance.decimals ?? 18)
  const warPowerDisplay = formatTokenValue(cityState.rhinoLocked, rhinoBalance.decimals ?? 18)

  const zenBalanceDisplay = formatTokenValue(zenBalance.raw, zenBalance.decimals ?? 18)
  const barBalanceDisplay = formatTokenValue(barBalance.raw, barBalance.decimals ?? 18)
  const rhinoBalanceDisplay = formatTokenValue(rhinoBalance.raw, rhinoBalance.decimals ?? 18)
  const ethBalanceDisplay = formatTokenValue(ethBalance.raw, 18)

  const highlightSwap = isAuthenticated && !barBalance.isLoading && barBalance.raw === 0n

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-4 space-y-6">
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
            <p className="text-2xl font-bold text-primary">{level}</p>
          </div>
        </div>

        <div className="relative aspect-square w-full bg-gradient-to-b from-muted/50 to-muted rounded-lg overflow-hidden border-2 border-border">
          <div className="absolute inset-0 flex items-center justify-center">
            <img
              src={townAsset.src}
              alt={`Rhino Lake level ${townAsset.level} city`}
              className="w-full h-full object-contain pixel-art"
              loading="eager"
            />
          </div>
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2">
            <div className="bg-card/90 backdrop-blur-sm px-4 py-2 rounded-full border border-border">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-primary" />
                <span className="font-mono font-semibold text-foreground">{powerDisplay} Power</span>
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="bg-muted/50 rounded-lg p-3 text-center">
            <p className="text-xs text-muted-foreground mb-1">Power (BAR Locked)</p>
            <p className="text-xl font-bold text-foreground">{powerDisplay}</p>
          </div>
          <div className="bg-muted/50 rounded-lg p-3 text-center">
            <p className="text-xs text-muted-foreground mb-1">War Power (RHINO)</p>
            <p className="text-xl font-bold text-foreground">{warPowerDisplay}</p>
          </div>
          <div className="bg-muted/50 rounded-lg p-3 text-center">
            <p className="text-xs text-muted-foreground mb-1">Hits Taken</p>
            <p className="text-xl font-bold text-foreground">{cityState.hits}</p>
          </div>
          <div className="bg-muted/50 rounded-lg p-3 text-center">
            <p className="text-xs text-muted-foreground mb-1">Status</p>
            <p className={`text-xl font-bold ${cityState.dead ? "text-destructive" : "text-primary"}`}>
              {cityId > 0n ? (cityState.dead ? "Dead" : "Alive") : "No City"}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="bg-muted/50 rounded-lg p-3 text-center">
            <p className="text-xs text-muted-foreground mb-1">ZEN Balance</p>
            <p className="text-xl font-bold text-foreground">{zenBalanceDisplay}</p>
          </div>
          <div className="bg-muted/50 rounded-lg p-3 text-center">
            <p className="text-xs text-muted-foreground mb-1">BAR Balance</p>
            <p className="text-xl font-bold text-foreground">{barBalanceDisplay}</p>
          </div>
          <div className="bg-muted/50 rounded-lg p-3 text-center">
            <p className="text-xs text-muted-foreground mb-1">RHINO Balance</p>
            <p className="text-xl font-bold text-foreground">{rhinoBalanceDisplay}</p>
          </div>
          <div className="bg-muted/50 rounded-lg p-3 text-center">
            <p className="text-xs text-muted-foreground mb-1">ETH Balance</p>
            <p className="text-xl font-bold text-foreground">{ethBalanceDisplay}</p>
          </div>
        </div>
      </Card>

      <div className="w-full max-w-md space-y-4">
        {!isOnBase && isAuthenticated && (
          <p className="text-center text-xs text-amber-500">Switch to Base mainnet to manage your city.</p>
        )}

        {!isAuthenticated ? (
          <Button
            onClick={handleConnect}
            disabled={isPrimaryLoading}
            className="w-full h-14 text-lg font-bold"
            size="lg"
          >
            {isPrimaryLoading ? (
              <>
                <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                Connecting...
              </>
            ) : (
              <>
                <Coins className="w-5 h-5 mr-2" />
                Connect Base Account
              </>
            )}
          </Button>
        ) : !isCityReady ? (
          <Button
            disabled
            className="w-full h-14 text-lg font-bold"
            size="lg"
          >
            <Loader2 className="w-5 h-5 mr-2 animate-spin" />
            Loading City...
          </Button>
        ) : !hasCity ? (
          <Button
            onClick={handleCreateCity}
            disabled={isPrimaryLoading || activeAction === "create" || !isOnBase}
            className="w-full h-14 text-lg font-bold"
            size="lg"
          >
            {activeAction === "create" ? (
              <>
                <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                Minting City...
              </>
            ) : (
              <>
                <Coins className="w-5 h-5 mr-2" />
                Mint City
              </>
            )}
          </Button>
        ) : (
          <div className="grid gap-3">
            <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-3">
              <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <Shield className="h-4 w-4 text-primary" />
                Grow City (Lock BAR)
              </div>
              <Input
                type="number"
                value={barLockAmount}
                onChange={(event) => setBarLockAmount(event.target.value)}
                placeholder="BAR amount"
                className="h-11"
                min="0"
                step="1"
              />
              <Button
                onClick={handleLockBar}
                disabled={isActionDisabled || activeAction === "lock-bar" || !barLockAmount}
                className="w-full"
              >
                {activeAction === "lock-bar" ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Locking BAR...
                  </>
                ) : (
                  "Lock BAR"
                )}
              </Button>
            </div>

            <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-3">
              <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <Swords className="h-4 w-4 text-primary" />
                War Power (Lock RHINO)
              </div>
              <Input
                type="number"
                value={rhinoLockAmount}
                onChange={(event) => setRhinoLockAmount(event.target.value)}
                placeholder="RHINO amount"
                className="h-11"
                min="0"
                step="1"
              />
              <Button
                onClick={handleLockRhino}
                disabled={isActionDisabled || activeAction === "lock-rhino" || !rhinoLockAmount}
                className="w-full"
                variant="outline"
              >
                {activeAction === "lock-rhino" ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Locking RHINO...
                  </>
                ) : (
                  "Lock RHINO"
                )}
              </Button>
            </div>
          </div>
        )}

        {hasCity && ethClaimable > 0n && (
          <p className="text-center text-xs text-muted-foreground">
            Unclaimed ETH rewards available in your Profile.
          </p>
        )}

        {authError && !isAuthenticated && <p className="text-center text-xs text-muted-foreground">{authError}</p>}
        <ConnectionDebug />
        <ManifestStatusPanel />
      </div>

      <div className="w-full max-w-md">
        <SwapPanel highlightSwap={highlightSwap} onSwapSuccess={refetchAll} />
      </div>
    </div>
  )
}
