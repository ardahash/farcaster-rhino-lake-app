"use client"

import { useState } from "react"
import { useName } from "@coinbase/onchainkit/identity"
import { Card } from "@/components/ui/card"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { useToast } from "@/hooks/use-toast"
import { useBaseAuth } from "@/lib/base-auth"
import {
  BASE_CHAINS,
  DEFAULT_CHAIN_ID,
  getChainLabel,
} from "@/lib/base-config"
import { useGame } from "@/lib/game-state"
import { Crown, Trophy, Sparkles, TrendingUp, Loader2 } from "lucide-react"
import { useSwitchChain } from "wagmi"
import { useErc20Balance } from "@/lib/use-erc20-balance"
import { BASE_MAINNET_CHAIN_ID } from "@/lib/zen-burn"
import { base } from "wagmi/chains"

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

export function ProfileScreen() {
  const { address, chainId, isAuthenticated, isConnecting, signIn, signOut, error: authError } = useBaseAuth()
  const { state, claimPendingPower } = useGame()
  const { toast } = useToast()
  const [isAuthLoading, setIsAuthLoading] = useState(false)
  const { switchChainAsync, isPending: isSwitching } = useSwitchChain()
  const { data: resolvedName, isLoading: isNameLoading } = useName({ address, chain: base })
  const barBalance = useErc20Balance({
    token: "0x1637b8c1Fba28E99776229DF6a7D9f5213E20b07",
    address: address as `0x${string}` | null,
    chainId: BASE_MAINNET_CHAIN_ID,
    enabled: Boolean(isAuthenticated && address),
  })

  const achievements = [
    { id: 1, name: "First Sacrifice", icon: Sparkles, unlocked: state.totalSacrifices >= 1 },
    { id: 2, name: "Power Builder", icon: TrendingUp, unlocked: state.zenPower >= 100 },
    { id: 3, name: "Temple Master", icon: Crown, unlocked: state.cityLevel >= 3 },
    { id: 4, name: "Legendary Ruler", icon: Trophy, unlocked: state.cityLevel >= 10 },
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
  const profileBio = "Builder of empires, master of ZEN"
  const profileTag = baseName ?? (isAuthenticated ? shortAddress : "Base Mini App")
  const walletLabel = baseName ?? shortAddress
  const currentNetwork = getChainLabel(chainId)
  const isActionLoading = isAuthLoading || isConnecting || isSwitching
  const barBalanceValue = Number(barBalance.formatted)
  const barBalanceDisplay =
    isAuthenticated && barBalance.isLoading
      ? "..."
      : isAuthenticated && Number.isFinite(barBalanceValue)
        ? barBalanceValue.toFixed(4)
        : "--"
  const barDecimals = barBalance.decimals ?? 18
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

        {/* Profile Card */}
        <Card className="game-card p-6 space-y-6">
          <div className="flex flex-col items-center space-y-4">
            <Avatar className="w-24 h-24 border-4 border-primary">
              <AvatarImage src={avatarUrl} alt={displayName} />
              <AvatarFallback className="text-2xl">{avatarFallback}</AvatarFallback>
            </Avatar>

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

          {/* Stats Grid */}
          <div className="grid grid-cols-2 gap-4 pt-4">
            <div className="bg-muted/50 rounded-lg p-4 text-center">
              <p className="text-sm text-muted-foreground mb-1">City Level</p>
              <p className="text-3xl font-bold text-primary">{state.cityLevel}</p>
            </div>
            <div className="bg-muted/50 rounded-lg p-4 text-center">
              <p className="text-sm text-muted-foreground mb-1">Power</p>
              <p className="text-3xl font-bold text-foreground">{state.zenPower.toFixed(0)}</p>
            </div>
            <div className="bg-muted/50 rounded-lg p-4 text-center">
              <p className="text-sm text-muted-foreground mb-1">BAR Points</p>
              <p className="text-3xl font-bold text-foreground">{state.barPoints.toFixed(0)}</p>
            </div>
            <div className="bg-muted/50 rounded-lg p-4 text-center">
              <p className="text-sm text-muted-foreground mb-1">Pending Power</p>
              <p className="text-3xl font-bold text-foreground">{state.barPowerPending.toFixed(0)}</p>
            </div>
            <div className="bg-muted/50 rounded-lg p-4 text-center">
              <p className="text-sm text-muted-foreground mb-1">Total Sacrifices</p>
              <p className="text-3xl font-bold text-foreground">{state.totalSacrifices}</p>
            </div>
            <div className="bg-muted/50 rounded-lg p-4 text-center">
              <p className="text-sm text-muted-foreground mb-1">Temple Burned</p>
              <p className="text-3xl font-bold text-primary">{state.stakedZen}</p>
            </div>
          </div>
        </Card>

        <Card className="game-card p-6 space-y-4 mt-6">
          <div className="space-y-2 text-center">
            <h3 className="font-semibold text-lg text-foreground">BAR Power Claim</h3>
            <p className="text-sm text-muted-foreground">
              Hold 10,000,000 BAR to earn passive power. Claim it when you want.
            </p>
          </div>
          <Button
            onClick={() => {
              claimPendingPower()
              toast({
                title: "Power Claimed",
                description: "Your BAR power has been added to your total power.",
              })
            }}
            disabled={!isAuthenticated || state.barPowerPending <= 0}
            className="w-full h-12 text-lg font-semibold"
            size="lg"
          >
            Claim {state.barPowerPending.toFixed(0)} Power
          </Button>
        </Card>

        <Card className="game-card p-6 space-y-4 mt-6">
          <div className="space-y-2 text-center">
            <h3 className="font-semibold text-lg text-foreground">Base Account</h3>
            <p className="text-sm text-muted-foreground">
              Connect your Base account to enable onchain sacrifices and rewards.
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
          {!isAuthenticated && (
            <div className="grid gap-2">
              <Button
                onClick={() => handleConnect("coinbase")}
                disabled={isActionLoading}
                className="w-full h-12 text-lg font-semibold"
                size="lg"
                variant="outline"
              >
                Connect Base Wallet
              </Button>
              <Button
                onClick={() => handleConnect("injected")}
                disabled={isActionLoading}
                className="w-full h-12 text-lg font-semibold"
                size="lg"
                variant="outline"
              >
                Connect MetaMask
              </Button>
            </div>
          )}
        </Card>

        {/* Achievements */}
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
