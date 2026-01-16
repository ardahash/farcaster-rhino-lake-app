"use client"

import { useEffect, useRef } from "react"
import { useBaseAuth } from "@/lib/base-auth"
import { useErc20Balance } from "@/lib/use-erc20-balance"
import { useGame } from "@/lib/game-state"
import { BASE_MAINNET_CHAIN_ID } from "@/lib/zen-burn"

const BAR_TOKEN_ADDRESS = "0x1637b8c1Fba28E99776229DF6a7D9f5213E20b07" as const
const BAR_POWER_THRESHOLD = 10_000_000
const TICK_MS = 60_000
const POWER_RATES = [
  { threshold: 1_000_000_000, rate: 10 },
  { threshold: 100_000_000, rate: 5 },
  { threshold: 10_000_000, rate: 1 },
]

export function PassiveBarPower() {
  const { address, isAuthenticated } = useBaseAuth()
  const { state, addPendingPower, setLastBarAccrualAt } = useGame()
  const lastTickRef = useRef<number | null>(null)
  const barBalance = useErc20Balance({
    token: BAR_TOKEN_ADDRESS,
    address: address ?? null,
    chainId: BASE_MAINNET_CHAIN_ID,
    enabled: Boolean(isAuthenticated && address),
  })

  useEffect(() => {
    if (!isAuthenticated || !address) {
      setLastBarAccrualAt(null)
      return
    }
    if (barBalance.isLoading) return
    if (barBalance.decimals === undefined) return

    const thresholdRaw = BigInt(BAR_POWER_THRESHOLD) * 10n ** BigInt(barBalance.decimals)
    if (barBalance.raw < thresholdRaw) {
      setLastBarAccrualAt(null)
      return
    }

    const powerRate = POWER_RATES.find((entry) => {
      const entryRaw = BigInt(entry.threshold) * 10n ** BigInt(barBalance.decimals)
      return barBalance.raw >= entryRaw
    })?.rate

    if (!powerRate) {
      setLastBarAccrualAt(null)
      return
    }

    const tick = () => {
      const now = Date.now()
      if (lastTickRef.current && now - lastTickRef.current < TICK_MS * 0.5) {
        return
      }
      lastTickRef.current = now
      const lastAccruedAt = state.lastBarAccrualAt ?? now
      if (lastAccruedAt === now) {
        setLastBarAccrualAt(now)
        return
      }
      const elapsed = now - lastAccruedAt
      if (elapsed < TICK_MS) {
        return
      }
      const minutes = Math.floor(elapsed / TICK_MS)
      const accruedAt = lastAccruedAt + minutes * TICK_MS
      addPendingPower(minutes * powerRate, accruedAt)
    }

    tick()
    const interval = setInterval(tick, TICK_MS)
    return () => clearInterval(interval)
  }, [
    addPendingPower,
    address,
    barBalance.decimals,
    barBalance.isLoading,
    barBalance.raw,
    isAuthenticated,
    setLastBarAccrualAt,
    state.lastBarAccrualAt,
  ])

  return null
}
