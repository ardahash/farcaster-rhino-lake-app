"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { useBaseAuth } from "@/lib/base-auth"
import { useGame } from "@/lib/game-state"
import { Loader2, Sparkles, Castle, Coins } from "lucide-react"
import { useToast } from "@/hooks/use-toast"

export function HomeScreen() {
  const { address, isAuthenticated, isConnecting, signIn, error: authError } = useBaseAuth()
  const { state, sacrificeZen } = useGame()
  const { toast } = useToast()
  const [isLoading, setIsLoading] = useState(false)
  const [isAuthLoading, setIsAuthLoading] = useState(false)

  const handleSacrifice = async () => {
    setIsLoading(true)
    try {
      await sacrificeZen(0.01)
      toast({
        title: "Sacrifice Complete!",
        description: "+0.1 ZEN Power added to your empire",
      })
    } catch (error) {
      toast({
        title: "Sacrifice Failed",
        description: "Please try again",
        variant: "destructive",
      })
    } finally {
      setIsLoading(false)
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

  const shortAddress = address ? `${address.slice(0, 6)}...${address.slice(-4)}` : "guest"
  const displayName = isAuthenticated ? "Base Account" : "Rhino Lake Ruler"
  const username = isAuthenticated ? shortAddress : "rhino-lake"
  const avatarUrl = "/rhino-avatar-purple.jpg"
  const avatarFallback = displayName[0] ?? "?"
  const isPrimaryLoading = isLoading || isAuthLoading || isConnecting

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
            <Castle className="w-32 h-32 text-primary/20 pixel-art" />
          </div>
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2">
            <div className="bg-card/90 backdrop-blur-sm px-4 py-2 rounded-full border border-border">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-primary" />
                <span className="font-mono font-semibold text-foreground">{state.zenPower.toFixed(1)} ZEN Power</span>
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
            <p className="text-xs text-muted-foreground mb-1">Staked ZEN</p>
            <p className="text-xl font-bold text-primary">{state.stakedZen}</p>
          </div>
        </div>
      </Card>

      {/* Primary Sacrifice Button */}
      <div className="w-full max-w-md space-y-3">
        <Button
          onClick={isAuthenticated ? handleSacrifice : handleConnect}
          disabled={isPrimaryLoading}
          className="w-full h-14 text-lg font-bold"
          size="lg"
        >
          {isLoading ? (
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
        {authError && !isAuthenticated && (
          <p className="text-center text-xs text-muted-foreground">{authError}</p>
        )}
      </div>
    </div>
  )
}
