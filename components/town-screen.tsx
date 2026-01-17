"use client"

import { useMemo } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { useBaseAuth } from "@/lib/base-auth"
import { BASE_MAINNET_CHAIN_ID } from "@/lib/base-config"
import { CONTRACTS, ERC20_ABI } from "@/lib/contracts"
import { useCityId } from "@/hooks/use-city-id"
import { useCityState } from "@/hooks/use-city-state"
import { getLevelFromBarLocked } from "@/lib/game-state"
import { TownViewer } from "@/components/town-viewer"
import { formatUnits } from "viem"
import { useReadContract } from "wagmi"

const formatTokenValue = (raw: bigint, decimals: number, fallback = "--") => {
  try {
    const value = Number(formatUnits(raw, decimals))
    if (!Number.isFinite(value)) return fallback
    return value.toLocaleString(undefined, { maximumFractionDigits: 4 })
  } catch {
    return fallback
  }
}

type TownScreenProps = {
  onEnterTemple: () => void
}

export function TownScreen({ onEnterTemple }: TownScreenProps) {
  const { address } = useBaseAuth()
  const { cityId } = useCityId(address)
  const { cityState, isLoading: isCityLoading } = useCityState(cityId, address)

  const { data: barDecimals } = useReadContract({
    address: CONTRACTS.BAR,
    abi: ERC20_ABI,
    functionName: "decimals",
    chainId: BASE_MAINNET_CHAIN_ID,
    query: {
      enabled: Boolean(address),
    },
  })

  const resolvedBarDecimals = Number(barDecimals ?? 18)
  const cityLevel = getLevelFromBarLocked(cityState.barLocked, resolvedBarDecimals)
  const displayLevel = cityLevel > 0 ? cityLevel : 1
  const powerDisplay = useMemo(
    () => formatTokenValue(cityState.barLocked, resolvedBarDecimals),
    [cityState.barLocked, resolvedBarDecimals],
  )

  return (
    <div className="flex-1 p-4 space-y-6 max-w-3xl mx-auto">
      <div className="pt-4 text-center space-y-2">
        <h1 className="text-3xl font-bold text-primary gold-glow">Your Town</h1>
        <p className="text-muted-foreground">Rotate your city and plan your next move.</p>
      </div>

      <Card className="game-card p-4 space-y-4">
        <TownViewer level={displayLevel} />
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-muted/50 rounded-lg p-3 text-center">
            <p className="text-xs text-muted-foreground mb-1">City Level</p>
            <p className="text-2xl font-bold text-primary">{isCityLoading ? "--" : cityLevel}</p>
          </div>
          <div className="bg-muted/50 rounded-lg p-3 text-center">
            <p className="text-xs text-muted-foreground mb-1">City Power</p>
            <p className="text-2xl font-bold text-foreground">{powerDisplay}</p>
          </div>
        </div>
      </Card>

      <div className="relative overflow-hidden rounded-lg border border-border">
        <img src="/rhinolakeTown.png" alt="Rhino Lake Town" className="w-full h-full object-cover" />
        <div className="absolute inset-0 flex items-center justify-center bg-black/30">
          <Button onClick={onEnterTemple} size="lg" className="px-8 text-base font-semibold">
            Enter Temple
          </Button>
        </div>
      </div>
    </div>
  )
}
