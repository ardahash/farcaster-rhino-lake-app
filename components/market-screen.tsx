"use client"

import { GuideCard } from "@/components/guide-card"
import { SwapPanel } from "@/components/swap-panel"

export function MarketScreen() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center p-4 space-y-6">
      <GuideCard
        title="Merchant's Offer"
        description="Swap ETH into $BAR to power your city. Choose an amount and confirm the trade."
        modelSrc="/3d/merchant.glb"
      />
      <div className="w-full max-w-md">
        <SwapPanel />
      </div>
    </div>
  )
}
