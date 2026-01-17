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
              Warriors and builders from across the lands discovered that burning ZEN at the lake could forge legendary
              RHINO, and that locking BAR into their cities awakened true power.
            </p>
            <p>
              Those who mastered growth, war, and rewards became legendary rulers, their names echoing through eternity.
            </p>
          </div>
        </Card>

        {/* Game Mechanics */}
        <Card className="game-card p-6 space-y-4">
          <h3 className="font-semibold text-lg text-foreground">How to Play</h3>

          <Accordion type="single" collapsible className="w-full">
            <AccordionItem value="burn">
              <AccordionTrigger className="text-foreground">
                <div className="flex items-center gap-2">
                  <Coins className="w-5 h-5 text-primary" />
                  <span>Burn ZEN</span>
                </div>
              </AccordionTrigger>
              <AccordionContent className="text-muted-foreground leading-relaxed">
                Burn ZEN in the Temple to mint RHINO directly to your wallet. RHINO fuels war and city defense, and all
                burns happen on Base mainnet.
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="city-growth">
              <AccordionTrigger className="text-foreground">
                <div className="flex items-center gap-2">
                  <Castle className="w-5 h-5 text-primary" />
                  <span>Grow Your City</span>
                </div>
              </AccordionTrigger>
              <AccordionContent className="text-muted-foreground leading-relaxed">
                City power comes from BAR locked inside the Game contract. Levels unlock at 25M, 50M, and 200M BAR
                locked. Lock BAR to grow, and lock RHINO to build war strength.
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
                BAR is the Rhino Lake growth token. Locking BAR directly increases your city power and determines your
                level. More BAR locked means stronger cities and higher rewards.
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
                Balance between burning ZEN for RHINO, locking BAR for growth, and using RHINO for war. Strong cities
                accumulate ETH rewards based on their total locked weight.
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
