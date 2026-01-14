"use client"

import { WalletIsland } from "@coinbase/onchainkit/wallet"
import { useIsMobile } from "@/hooks/use-mobile"

export function WalletIslandDock() {
  const isMobile = useIsMobile()
  if (isMobile) return null

  return <WalletIsland />
}
