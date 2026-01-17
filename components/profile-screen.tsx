"use client"

import { useMemo, useState } from "react"
import { useName } from "@coinbase/onchainkit/identity"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { PfpAvatar } from "@/components/pfp-avatar"
import { useToast } from "@/hooks/use-toast"
import { useBaseAuth } from "@/lib/base-auth"
import { BASE_CHAINS, DEFAULT_CHAIN_ID, getChainLabel } from "@/lib/base-config"
import { CONTRACTS, GAME_ABI } from "@/lib/contracts"
import { getProgressionState } from "@/lib/game-state"
import { useCityId } from "@/hooks/use-city-id"
import { useCityState } from "@/hooks/use-city-state"
import { useErc20Balance } from "@/lib/use-erc20-balance"
import { Crown, Trophy, Sparkles, TrendingUp, Loader2 } from "lucide-react"
import { usePublicClient, useSendTransaction, useSwitchChain } from "wagmi"
import { base } from "wagmi/chains"
import { encodeFunctionData, formatUnits } from "viem"

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

export function ProfileScreen() {
  const { address, chainId, isAuthenticated, isConnecting, signIn, signOut, error: authError } = useBaseAuth()
  const { toast } = useToast()
  const [isAuthLoading, setIsAuthLoading] = useState(false)
  const [isClaiming, setIsClaiming] = useState(false)
  const { switchChainAsync, isPending: isSwitching } = useSwitchChain()
  const publicClient = usePublicClient({ chainId: DEFAULT_CHAIN_ID })
  const { sendTransactionAsync } = useSendTransaction()

  const { data: resolvedName, isLoading: isNameLoading } = useName({ address, chain: base })
  const { cityId } = useCityId(address)
  const { cityState, ethClaimable, refetch: refetchCityState } = useCityState(cityId, address)

  const barBalance = useErc20Balance({
    token: CONTRACTS.BAR,
    address,
    chainId: DEFAULT_CHAIN_ID,
    enabled: Boolean(isAuthenticated && address),
  })

  const rhinoBalance = useErc20Balance({
    token: CONTRACTS.RHINO,
    address,
    chainId: DEFAULT_CHAIN_ID,
    enabled: Boolean(isAuthenticated && address),
  })

  const barDecimals = barBalance.decimals ?? 18
  const { level, isStarter } = getProgressionState(cityState.barLocked, barDecimals, cityId > 0n)

  const achievements = [
    { id: 1, name: "First City", icon: Sparkles, unlocked: cityId > 0n },
    { id: 2, name: "Power Builder", icon: TrendingUp, unlocked: cityState.barLocked > 0n },
    { id: 3, name: "Temple Master", icon: Crown, unlocked: level >= 3 },
    { id: 4, name: "Legendary Ruler", icon: Trophy, unlocked: level >= 10 },
  ]

  const handleConnect = async (preferred?: "coinbase" | "injected") => {
    setIsAuthLoading(true)
    try {
      await signIn(preferred)
      toast({
        title: "Base Account Connected",
        description: "Your Base account is now linked.",
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

  const handleDisconnect = () => {
    signOut()
    toast({
      title: "Disconnected",
      description: "Your Base account has been disconnected.",
    })
  }

  const handleSwitchNetwork = async () => {
    if (!isAuthenticated) {
      return
    }
    const activeChainId = chainId ?? DEFAULT_CHAIN_ID
    const nextChain = BASE_CHAINS.find((chain) => chain.id !== activeChainId) ?? BASE_CHAINS[0]
    try {
      await switchChainAsync({ chainId: nextChain.id })
      toast({
        title: "Network Updated",
        description: `Switched to ${getChainLabel(nextChain.id)}.`,
      })
    } catch (caughtError) {
      const message = caughtError instanceof Error ? caughtError.message : "Unable to switch networks."
      toast({
        title: "Network Switch Failed",
        description: message,
        variant: "destructive",
      })
    }
  }

  const ensureBaseNetwork = async () => {
    const activeChainId = chainId ?? DEFAULT_CHAIN_ID
    if (activeChainId !== DEFAULT_CHAIN_ID) {
      await switchChainAsync({ chainId: DEFAULT_CHAIN_ID })
      throw new Error("Switching to Base mainnet. Please try again.")
    }
    return DEFAULT_CHAIN_ID
  }

  const handleClaimEth = async () => {
    setIsClaiming(true)
    try {
      if (!isAuthenticated || !address) {
        await handleConnect("coinbase")
        return
      }

      if (cityId <= 0n) {
        throw new Error("Mint a city to claim rewards.")
      }

      if (ethClaimable <= 0n) {
        throw new Error("No ETH rewards available.")
      }

      await ensureBaseNetwork()

      const txHash = await sendTransactionAsync({
        chainId: DEFAULT_CHAIN_ID,
        account: address,
        to: CONTRACTS.GAME,
        data: encodeFunctionData({
          abi: GAME_ABI,
          functionName: "claimEth",
          args: [cityId],
        }),
      })
      if (publicClient) {
        await publicClient.waitForTransactionReceipt({ hash: txHash })
      }

      toast({
        title: "Rewards Claimed",
        description: "ETH rewards sent to your wallet.",
      })
      refetchCityState()
    } catch (caughtError) {
      const message = caughtError instanceof Error ? caughtError.message : "Unable to claim rewards."
      toast({
        title: "Claim Failed",
        description: message,
        variant: "destructive",
      })
    } finally {
      setIsClaiming(false)
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
  const avatarFallback = displayName[0] ?? "?"
  const profileBio = "Builder of empires, master of BAR and RHINO"
  const profileTag = baseName ?? (isAuthenticated ? shortAddress : "Base Mini App")
  const walletLabel = baseName ?? shortAddress
  const currentNetwork = getChainLabel(chainId)
  const isActionLoading = isAuthLoading || isConnecting || isSwitching
  const isOnBase = !chainId || chainId === DEFAULT_CHAIN_ID

  const barBalanceDisplay = formatTokenValue(barBalance.raw, barBalance.decimals ?? 18)
  const powerDisplay = formatTokenValue(cityState.barLocked, barBalance.decimals ?? 18)
  const rhinoLockedDisplay = formatTokenValue(cityState.rhinoLocked, rhinoBalance.decimals ?? 18)
  const ethClaimableDisplay = useMemo(() => formatTokenValue(ethClaimable, 18), [ethClaimable])

  const barBadges = [
    { label: "BAR Whale 1M+", threshold: 1_000_000 },
    { label: "BAR Titan 10M+", threshold: 10_000_000 },
    { label: "BAR Colossus 100M+", threshold: 100_000_000 },
    { label: "BAR Monarch 1B+", threshold: 1_000_000_000 },
  ].filter((badge) => {
    const thresholdRaw = BigInt(badge.threshold) * 10n ** BigInt(barDecimals)
    return barBalance.raw >= thresholdRaw
  })

  return (
    <div className="flex-1 p-4 space-y-6 max-w-2xl mx-auto">
      <div className="pt-4">
        <h1 className="text-3xl font-bold text-center text-foreground mb-6">Your Profile</h1>

        <Card className="game-card p-6 space-y-6">
          <div className="flex flex-col items-center space-y-4">
            <PfpAvatar
              displayName={displayName}
              fallback={avatarFallback}
              className="w-24 h-24 border-4 border-primary"
              fallbackClassName="text-2xl"
            />

            <div className="text-center">
              <h2 className="text-2xl font-bold text-foreground">{displayName}</h2>
              <p className="text-muted-foreground">@{username}</p>
              <p className="text-sm text-muted-foreground mt-2 max-w-md">{profileBio}</p>
              {isAuthenticated && <p className="text-xs text-muted-foreground mt-2">Wallet: {walletLabel}</p>}
              {isAuthenticated && <p className="text-xs text-muted-foreground mt-1">BAR Balance: {barBalanceDisplay}</p>}
              {isAuthenticated && (
                <p className="text-xs text-muted-foreground mt-1">
                  Base Name: {isNameLoading ? "Loading..." : baseName ?? "Not set"}
                </p>
              )}
              {isAuthenticated && (
                <p className="text-xs text-muted-foreground mt-1">Network: {currentNetwork}</p>
              )}
            </div>

            <div className="flex flex-wrap items-center justify-center gap-2">
              <Badge variant="outline" className="text-primary border-primary">
                {profileTag}
              </Badge>
              {barBadges.map((badge) => (
                <Badge key={badge.label} variant="secondary">
                  {badge.label}
                </Badge>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 pt-4">
            <div className="bg-muted/50 rounded-lg p-4 text-center">
              <p className="text-sm text-muted-foreground mb-1">City Level</p>
              <p className="text-3xl font-bold text-primary">
                {cityId > 0n ? (isStarter ? "Level 1 (Starter)" : level) : "--"}
              </p>
            </div>
            <div className="bg-muted/50 rounded-lg p-4 text-center">
              <p className="text-sm text-muted-foreground mb-1">City Power</p>
              <p className="text-3xl font-bold text-foreground">{powerDisplay}</p>
            </div>
            <div className="bg-muted/50 rounded-lg p-4 text-center">
              <p className="text-sm text-muted-foreground mb-1">War Power</p>
              <p className="text-3xl font-bold text-foreground">{rhinoLockedDisplay}</p>
            </div>
            <div className="bg-muted/50 rounded-lg p-4 text-center">
              <p className="text-sm text-muted-foreground mb-1">Hits Taken</p>
              <p className="text-3xl font-bold text-foreground">{cityState.hits}</p>
            </div>
            <div className="bg-muted/50 rounded-lg p-4 text-center">
              <p className="text-sm text-muted-foreground mb-1">ETH Claimable</p>
              <p className="text-3xl font-bold text-foreground">{ethClaimableDisplay}</p>
            </div>
            <div className="bg-muted/50 rounded-lg p-4 text-center">
              <p className="text-sm text-muted-foreground mb-1">City Status</p>
              <p className={`text-3xl font-bold ${cityState.dead ? "text-destructive" : "text-primary"}`}>
                {cityId > 0n ? (cityState.dead ? "Dead" : "Alive") : "No City"}
              </p>
            </div>
          </div>
        </Card>

        <Card className="game-card p-6 space-y-4 mt-6">
          <div className="space-y-2 text-center">
            <h3 className="font-semibold text-lg text-foreground">ETH Rewards</h3>
            <p className="text-sm text-muted-foreground">
              Claim ETH rewards based on your city&apos;s BAR + RHINO weight.
            </p>
          </div>
          {!isOnBase && isAuthenticated && (
            <p className="text-xs text-amber-500 text-center">Switch to Base mainnet to claim rewards.</p>
          )}
          <Button
            onClick={handleClaimEth}
            disabled={!isAuthenticated || ethClaimable <= 0n || isClaiming || !isOnBase}
            className="w-full h-12 text-lg font-semibold"
            size="lg"
          >
            {isClaiming ? (
              <>
                <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                Claiming...
              </>
            ) : (
              `Claim ${ethClaimableDisplay} ETH`
            )}
          </Button>
        </Card>

        <Card className="game-card p-6 space-y-4 mt-6">
          <div className="space-y-2 text-center">
            <h3 className="font-semibold text-lg text-foreground">Base Account</h3>
            <p className="text-sm text-muted-foreground">
              Connect your Base account to enable onchain actions and rewards.
            </p>
          </div>
          <Button
            onClick={isAuthenticated ? handleDisconnect : () => handleConnect("coinbase")}
            disabled={isActionLoading}
            className="w-full h-12 text-lg font-semibold"
            size="lg"
          >
            {isActionLoading ? (
              <>
                <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                {isAuthenticated ? "Working..." : "Connecting..."}
              </>
            ) : isAuthenticated ? (
              "Disconnect Base Account"
            ) : (
              "Connect Base Account"
            )}
          </Button>
          <Button
            onClick={handleSwitchNetwork}
            disabled={!isAuthenticated || isActionLoading}
            className="w-full h-12 text-lg font-semibold"
            size="lg"
            variant="outline"
          >
            {isSwitching ? (
              <>
                <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                Switching Network...
              </>
            ) : (
              "Switch Base Network"
            )}
          </Button>
          {authError && !isAuthenticated && <p className="text-xs text-muted-foreground text-center">{authError}</p>}
        </Card>

        <Card className="game-card p-6 space-y-4 mt-6">
          <h3 className="font-semibold text-lg text-foreground">Achievements</h3>
          <div className="grid grid-cols-2 gap-3">
            {achievements.map((achievement) => {
              const Icon = achievement.icon
              return (
                <div
                  key={achievement.id}
                  className={`p-4 rounded-lg border-2 transition-all ${
                    achievement.unlocked ? "bg-primary/10 border-primary/30" : "bg-muted/30 border-border opacity-50"
                  }`}
                >
                  <div className="flex flex-col items-center gap-2 text-center">
                    <Icon className={`w-8 h-8 ${achievement.unlocked ? "text-primary" : "text-muted-foreground"}`} />
                    <p className="text-sm font-semibold text-foreground">{achievement.name}</p>
                  </div>
                </div>
              )
            })}
          </div>
        </Card>
      </div>
    </div>
  )
}
