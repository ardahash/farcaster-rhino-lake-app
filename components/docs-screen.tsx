"use client"

import { Card } from "@/components/ui/card"
import { BookOpen, Coins, ShieldCheck, Wallet } from "lucide-react"

export function DocsScreen() {
  return (
    <div className="flex-1 p-4 space-y-6 max-w-2xl mx-auto">
      <div className="pt-4 text-center space-y-2">
        <div className="flex justify-center mb-4">
          <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
            <BookOpen className="w-8 h-8 text-primary" />
          </div>
        </div>
        <h1 className="text-3xl font-bold text-primary gold-glow">Rhino Lake Docs</h1>
        <p className="text-muted-foreground">Launch details and reward mechanics for $BAR.</p>
      </div>

      <Card className="game-card p-6 space-y-3">
        <div className="flex items-center gap-2 text-foreground">
          <ShieldCheck className="w-5 h-5 text-primary" />
          <h3 className="font-semibold text-lg">Fair Launch on Clanker.world</h3>
        </div>
        <div className="space-y-3 text-sm text-muted-foreground leading-relaxed">
          <p>
            Rhino Lake $BAR was created on Clanker.world with a zero dev supply. There was no dev minting, no presale,
            and no team allocation at launch.
          </p>
          <p>Every token entered circulation through the public fair launch.</p>
        </div>
      </Card>

      <Card className="game-card p-6 space-y-3">
        <div className="flex items-center gap-2 text-foreground">
          <Coins className="w-5 h-5 text-primary" />
          <h3 className="font-semibold text-lg">Swap Tax and Rewards</h3>
        </div>
        <div className="space-y-3 text-sm text-muted-foreground leading-relaxed">
          <p>
            $BAR charges a 3% tax on swaps. That tax funds ETH reward distributions for Rhino Lake players.
          </p>
          <p>Rewards are distributed through the in-game systems and claimed by players on Base mainnet.</p>
        </div>
      </Card>

      <Card className="game-card p-6 space-y-3">
        <div className="flex items-center gap-2 text-foreground">
          <Wallet className="w-5 h-5 text-primary" />
          <h3 className="font-semibold text-lg">What This Means for Players</h3>
        </div>
        <div className="space-y-3 text-sm text-muted-foreground leading-relaxed">
          <p>Locking $BAR grows city power, and holding $BAR qualifies you for leaderboard placement.</p>
          <p>Claimable ETH rewards are available in the Profile tab once your city is active.</p>
        </div>
      </Card>
    </div>
  )
}
