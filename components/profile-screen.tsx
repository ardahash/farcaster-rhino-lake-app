"use client"

import { useEffect, useMemo, useState } from "react"
import { Card } from "@/components/ui/card"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { useToast } from "@/hooks/use-toast"
import { useBaseAuth } from "@/lib/base-auth"
import {
  BASE_CHAINS,
  BASE_NAME_GATEWAYS,
  BASE_NAME_RESOLVER_ADDRESS,
  DEFAULT_CHAIN_ID,
  MAINNET_RPC_URL,
  getChainLabel,
} from "@/lib/base-config"
import { useGame } from "@/lib/game-state"
import { BASE_MAINNET_CHAIN_ID } from "@/lib/zen-burn"
import { Crown, Trophy, Sparkles, TrendingUp, Loader2 } from "lucide-react"
import { createPublicClient, http, toCoinType } from "viem"
import { mainnet } from "viem/chains"
import { useSwitchChain } from "wagmi"

export function ProfileScreen() {
  const { address, chainId, isAuthenticated, isConnecting, signIn, signOut, error: authError } = useBaseAuth()
  const { state } = useGame()
  const { toast } = useToast()
  const [isAuthLoading, setIsAuthLoading] = useState(false)
  const [baseName, setBaseName] = useState<string | null>(null)
  const [isNameLoading, setIsNameLoading] = useState(false)
  const { switchChainAsync, isPending: isSwitching } = useSwitchChain()
  const ensClient = useMemo(() => {
    if (!MAINNET_RPC_URL) return null
    return createPublicClient({
      chain: mainnet,
      transport: http(MAINNET_RPC_URL),
    })
  }, [MAINNET_RPC_URL])

  const achievements = [
    { id: 1, name: "First Sacrifice", icon: Sparkles, unlocked: state.totalSacrifices >= 1 },
    { id: 2, name: "Power Builder", icon: TrendingUp, unlocked: state.zenPower >= 100 },
    { id: 3, name: "Temple Master", icon: Crown, unlocked: state.cityLevel >= 3 },
    { id: 4, name: "Legendary Ruler", icon: Trophy, unlocked: state.cityLevel >= 10 },
  ]

  const handleConnect = async () => {
    setIsAuthLoading(true)
    try {
      await signIn()
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

  const shortAddress = address ? `${address.slice(0, 6)}...${address.slice(-4)}` : "guest"
  const displayName = isAuthenticated ? "Base Account" : "Rhino Lake Ruler"
  const username = isAuthenticated ? shortAddress : "rhino-lake"
  const avatarUrl = "/rhino-avatar-purple.jpg"
  const avatarFallback = displayName[0] ?? "?"
  const profileBio = "Builder of empires, master of ZEN"
  const profileTag = baseName ?? (isAuthenticated ? `Base ${shortAddress}` : "Base Mini App")
  const currentNetwork = getChainLabel(chainId)
  const isActionLoading = isAuthLoading || isConnecting || isSwitching

  useEffect(() => {
    if (!address || !ensClient || !BASE_NAME_RESOLVER_ADDRESS) {
      setBaseName(null)
      return
    }
    let cancelled = false
    const loadBaseName = async () => {
      setIsNameLoading(true)
      try {
        const name = await ensClient.getEnsName({
          address,
          coinType: toCoinType(BASE_MAINNET_CHAIN_ID),
          universalResolverAddress: BASE_NAME_RESOLVER_ADDRESS,
          gatewayUrls: BASE_NAME_GATEWAYS?.length ? BASE_NAME_GATEWAYS : undefined,
          strict: false,
        })
        if (!cancelled) {
          setBaseName(name)
        }
      } catch {
        if (!cancelled) {
          setBaseName(null)
        }
      } finally {
        if (!cancelled) {
          setIsNameLoading(false)
        }
      }
    }
    loadBaseName()
    return () => {
      cancelled = true
    }
  }, [address, ensClient])

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
              {isAuthenticated && (
                <p className="text-xs text-muted-foreground mt-2">Wallet: {address}</p>
              )}
              {isAuthenticated && (
                <p className="text-xs text-muted-foreground mt-1">
                  Base Name: {isNameLoading ? "Loading..." : baseName ?? "Not set"}
                </p>
              )}
              {isAuthenticated && (
                <p className="text-xs text-muted-foreground mt-1">Network: {currentNetwork}</p>
              )}
            </div>

            <Badge variant="outline" className="text-primary border-primary">
              {profileTag}
            </Badge>
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
            <h3 className="font-semibold text-lg text-foreground">Base Account</h3>
            <p className="text-sm text-muted-foreground">
              Connect your Base account to enable onchain sacrifices and rewards.
            </p>
          </div>
          <Button
            onClick={isAuthenticated ? handleDisconnect : handleConnect}
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
