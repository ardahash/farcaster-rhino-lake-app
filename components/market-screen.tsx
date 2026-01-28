"use client"

import { GuideCard } from "@/components/guide-card"
import { SwapPanel } from "@/components/swap-panel"
import { BandaSwapPanel } from "@/components/banda-swap-panel"

export function MarketScreen() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center p-4 space-y-6">
      <GuideCard
        title="Merchant's Offer"
        description="Swap ETH into $BAR or USDC into $BANDA to power your empire. Choose an amount and confirm."
        modelSrc="/3d/merchant.glb"
      />
      <div className="w-full max-w-md space-y-4">
        <SwapPanel />
        <BandaSwapPanel />
      </div>
    </div>
  )
}
