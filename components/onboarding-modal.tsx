"use client"

import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { useGame } from "@/lib/game-state"
import { Sparkles } from "lucide-react"

export function OnboardingModal() {
  const { state, completeOnboarding } = useGame()

  if (state.hasSeenOnboarding) {
    return null
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/95 backdrop-blur-sm p-4">
      <Card className="game-card max-w-md w-full p-6 space-y-6">
        <div className="flex justify-center">
          <div className="w-24 h-24 rounded-full bg-primary/10 flex items-center justify-center">
            <Sparkles className="w-12 h-12 text-primary" />
          </div>
        </div>

        <div className="space-y-4 text-center">
          <h1 className="text-3xl font-bold gold-glow text-primary">Welcome to Rhino Lake</h1>

          <div className="space-y-3 text-muted-foreground leading-relaxed">
            <p className="text-lg font-semibold text-foreground">Sacrifice ZEN to grow your Empire</p>

            <p>
              In ancient times, a mystical lake appeared where warriors would sacrifice their ZEN tokens to gain divine
              power and build legendary city-states.
            </p>

            <p>
              As ruler, you must balance sacrifice and temple burns to maximize your empire's growth. The more you
              sacrifice, the greater your power becomes.
            </p>
          </div>
        </div>

        <Button onClick={completeOnboarding} className="w-full h-12 text-lg font-semibold" size="lg">
          Enter the Empire
        </Button>
      </Card>
    </div>
  )
}
