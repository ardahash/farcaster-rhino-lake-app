"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { useGame } from "@/lib/game-state"
import { Loader2, Church, TrendingUp, Lock } from "lucide-react"
import { useToast } from "@/hooks/use-toast"

export function TempleScreen() {
  const { state, stakeZen } = useGame()
  const { toast } = useToast()
  const [isLoading, setIsLoading] = useState(false)
  const [stakeAmount, setStakeAmount] = useState("")

  const handleStake = async () => {
    const amount = Number.parseFloat(stakeAmount)
    if (!amount || amount <= 0) {
      toast({
        title: "Invalid Amount",
        description: "Please enter a valid ZEN amount",
        variant: "destructive",
      })
      return
    }

    setIsLoading(true)
    try {
      await stakeZen(amount)
      toast({
        title: "Staking Complete!",
        description: `Successfully staked ${amount} ZEN`,
      })
      setStakeAmount("")
    } catch (error) {
      toast({
        title: "Staking Failed",
        description: "Please try again",
        variant: "destructive",
      })
    } finally {
      setIsLoading(false)
    }
  }

  const nextLevelThreshold = state.cityLevel * 50
  const progressToNextLevel = ((state.stakedZen % 50) / 50) * 100

  return (
    <div className="flex-1 p-4 space-y-6 max-w-2xl mx-auto">
      <div className="text-center space-y-2 pt-4">
        <div className="flex justify-center mb-4">
          <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
            <Church className="w-8 h-8 text-primary" />
          </div>
        </div>
        <h1 className="text-3xl font-bold text-primary gold-glow">The Temple</h1>
        <p className="text-muted-foreground">Stake ZEN to upgrade your city and unlock divine powers</p>
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
            {state.stakedZen} / {nextLevelThreshold} ZEN staked
          </p>
        </div>
      </Card>

      {/* Staking Interface */}
      <Card className="game-card p-6 space-y-4">
        <div className="space-y-2">
          <label className="text-sm font-semibold text-foreground">Stake ZEN Amount</label>
          <Input
            type="number"
            placeholder="Enter amount..."
            value={stakeAmount}
            onChange={(e) => setStakeAmount(e.target.value)}
            className="h-12 text-lg"
            min="0"
            step="0.01"
          />
        </div>

        <Button
          onClick={handleStake}
          disabled={isLoading || !stakeAmount}
          className="w-full h-12 text-lg font-semibold"
          size="lg"
        >
          {isLoading ? (
            <>
              <Loader2 className="w-5 h-5 mr-2 animate-spin" />
              Staking...
            </>
          ) : (
            <>
              <TrendingUp className="w-5 h-5 mr-2" />
              Stake ZEN
            </>
          )}
        </Button>
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
