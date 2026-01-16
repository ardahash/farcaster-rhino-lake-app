"use client"

import { Card } from "@/components/ui/card"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { BookOpen, Coins, Castle, Crown } from "lucide-react"

export function InfoScreen() {
  return (
    <div className="flex-1 p-4 space-y-6 max-w-2xl mx-auto">
      <div className="pt-4">
        <div className="flex justify-center mb-4">
          <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
            <BookOpen className="w-8 h-8 text-primary" />
          </div>
        </div>
        <h1 className="text-3xl font-bold text-center text-primary gold-glow mb-2">The Legend</h1>
        <p className="text-center text-muted-foreground mb-6">Discover the ancient lore of Rhino Lake</p>

        {/* Lore Card */}
        <Card className="game-card p-6 space-y-4 mb-6">
          <h3 className="font-semibold text-lg text-foreground">The Origin Story</h3>
          <div className="space-y-3 text-muted-foreground leading-relaxed">
            <p>
              Long ago, in a realm between the digital and divine, a mystical lake appeared at the foot of an ancient
              mountain. The waters shimmered with an otherworldly energy called ZEN.
            </p>
            <p>
              Warriors and builders from across the lands discovered that by sacrificing ZEN to the lake, they could
              gain divine power to construct magnificent city-states. The more they sacrificed, the greater their empire
              grew.
            </p>
            <p>
              Those who learned to balance sacrifice with temple burns became legendary rulers, their names echoing
              through eternity.
            </p>
          </div>
        </Card>

        {/* Game Mechanics */}
        <Card className="game-card p-6 space-y-4">
          <h3 className="font-semibold text-lg text-foreground">How to Play</h3>

          <Accordion type="single" collapsible className="w-full">
            <AccordionItem value="sacrifice">
              <AccordionTrigger className="text-foreground">
                <div className="flex items-center gap-2">
                  <Coins className="w-5 h-5 text-primary" />
                  <span>Sacrifice ZEN</span>
                </div>
              </AccordionTrigger>
              <AccordionContent className="text-muted-foreground leading-relaxed">
                The primary way to gain power. Each sacrifice of 0.01 ZEN grants you 0.1 Power and 100 BAR points
                (10,000x the ZEN burned), increasing your empire's strength and unlocking new possibilities.
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="temple">
              <AccordionTrigger className="text-foreground">
                <div className="flex items-center gap-2">
                  <Castle className="w-5 h-5 text-primary" />
                  <span>Visit the Temple</span>
                </div>
              </AccordionTrigger>
              <AccordionContent className="text-muted-foreground leading-relaxed">
                Burn your ZEN in the Temple to upgrade your city level. The first upgrade costs 1 ZEN, then 2, then 4,
                doubling each level to unlock special abilities and benefits. Temple burns also award BAR points based on
                the ZEN burned.
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="bar-token">
              <AccordionTrigger className="text-foreground">
                <div className="flex items-center gap-2">
                  <Coins className="w-5 h-5 text-primary" />
                  <span>BAR Token Utility</span>
                </div>
              </AccordionTrigger>
              <AccordionContent className="text-muted-foreground leading-relaxed">
                BAR is the Rhino Lake token. Holding BAR unlocks passive Power accrual: 10M BAR earns 1 Power per minute,
                100M BAR earns 5 Power per minute, and 1B BAR earns 10 Power per minute. Accrued Power can be claimed from
                your profile at any time.
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="strategy">
              <AccordionTrigger className="text-foreground">
                <div className="flex items-center gap-2">
                  <Crown className="w-5 h-5 text-primary" />
                  <span>Build Your Empire</span>
                </div>
              </AccordionTrigger>
              <AccordionContent className="text-muted-foreground leading-relaxed">
                Balance between sacrificing for immediate power and temple burns for long-term upgrades. Higher city
                levels unlock powerful bonuses and establish your legacy as a legendary ruler.
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </Card>

        {/* Base Mini App Info */}
        <Card className="game-card p-6 space-y-3 mt-6">
          <h3 className="font-semibold text-lg text-foreground">Built for Base Mini Apps</h3>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Rhino Lake is a Base mini app built on the Base blockchain with real onchain gameplay.
          </p>
          <div className="flex gap-2 flex-wrap">
            <span className="px-3 py-1 bg-primary/10 text-primary text-xs font-semibold rounded-full">
              Base Network
            </span>
            <span className="px-3 py-1 bg-primary/10 text-primary text-xs font-semibold rounded-full">
              In-App Native
            </span>
            <span className="px-3 py-1 bg-primary/10 text-primary text-xs font-semibold rounded-full">
              Mobile First
            </span>
          </div>
        </Card>
      </div>
    </div>
  )
}
