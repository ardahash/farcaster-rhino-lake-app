"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { getLevelFromBurned, getTownAssetForLevel } from "@/lib/game-state"
import { BASE_NAME_GATEWAYS, BASE_NAME_RESOLVER_ADDRESS, MAINNET_RPC_URL } from "@/lib/base-config"
import { BASE_MAINNET_CHAIN_ID, ZEN_BURN_MANAGER_ABI, ZEN_BURN_MANAGER_ADDRESS, ZEN_BURNED_EVENT } from "@/lib/zen-burn"
import { Loader2, RefreshCcw, Users } from "lucide-react"
import { createPublicClient, formatUnits, http, toCoinType } from "viem"
import { mainnet } from "viem/chains"
import { usePublicClient, useReadContract } from "wagmi"

const resolveLookbackBlocks = () => {
  const raw = Number.parseInt(process.env.NEXT_PUBLIC_SOCIAL_LOOKBACK_BLOCKS ?? "", 10)
  if (Number.isFinite(raw) && raw > 0) return Math.min(raw, 1000)
  return 1000
}

const LOOKBACK_BLOCKS = resolveLookbackBlocks()
const MAX_LOG_BLOCK_RANGE = 1000n
const MAX_TOWNS = 20

type TownEntry = {
  address: `0x${string}`
  burnedTotal: number
  burnedDisplay: string
  level: number
  assetSrc: string
  baseName?: string | null
}

export function SocialScreen() {
  const publicClient = usePublicClient({ chainId: BASE_MAINNET_CHAIN_ID })
  const { data: zenDecimals } = useReadContract({
    address: ZEN_BURN_MANAGER_ADDRESS,
    abi: ZEN_BURN_MANAGER_ABI,
    functionName: "zenDecimals",
    chainId: BASE_MAINNET_CHAIN_ID,
  })
  const [towns, setTowns] = useState<TownEntry[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const decimals = useMemo(() => {
    if (typeof zenDecimals === "number") return zenDecimals
    return Number(zenDecimals ?? 18)
  }, [zenDecimals])

  const ensClient = useMemo(() => {
    if (!MAINNET_RPC_URL) return null
    return createPublicClient({
      chain: mainnet,
      transport: http(MAINNET_RPC_URL),
    })
  }, [MAINNET_RPC_URL])

  const resolveTownNames = useCallback(
    async (entries: TownEntry[]) => {
      if (!ensClient || !BASE_NAME_RESOLVER_ADDRESS) return
      const coinType = toCoinType(BASE_MAINNET_CHAIN_ID)
      const nextEntries = [...entries]
      for (let i = 0; i < nextEntries.length; i += 1) {
        const entry = nextEntries[i]
        if (entry.baseName !== undefined) continue
        try {
          const name = await ensClient.getEnsName({
            address: entry.address,
            coinType,
            universalResolverAddress: BASE_NAME_RESOLVER_ADDRESS,
            gatewayUrls: BASE_NAME_GATEWAYS?.length ? BASE_NAME_GATEWAYS : undefined,
            strict: false,
          })
          nextEntries[i] = { ...entry, baseName: name }
        } catch {
          nextEntries[i] = { ...entry, baseName: null }
        }
      }
      setTowns(nextEntries)
    },
    [ensClient],
  )

  const fetchTowns = useCallback(async () => {
    if (!publicClient) return
    setIsLoading(true)
    setError(null)
    try {
      const latestBlock = await publicClient.getBlockNumber()
      const lookback = BigInt(LOOKBACK_BLOCKS)
      const fromBlock = latestBlock > lookback ? latestBlock - lookback : 0n
      const logs = []
      for (
        let startBlock = fromBlock;
        startBlock <= latestBlock;
        startBlock += MAX_LOG_BLOCK_RANGE
      ) {
        const endBlock = startBlock + MAX_LOG_BLOCK_RANGE - 1n
        const chunk = await publicClient.getLogs({
          address: ZEN_BURN_MANAGER_ADDRESS,
          event: ZEN_BURNED_EVENT,
          fromBlock: startBlock,
          toBlock: endBlock > latestBlock ? latestBlock : endBlock,
        })
        logs.push(...chunk)
      }

      const totals = new Map<string, bigint>()
      for (const log of logs) {
        const args = log.args
        if (!args || !("user" in args) || !("newTotalBurned" in args)) continue
        totals.set(args.user, args.newTotalBurned)
      }

      const entries = Array.from(totals.entries())
        .map(([address, totalBurned]) => {
          const burnedValue = Number(formatUnits(totalBurned, decimals))
          const level = getLevelFromBurned(burnedValue)
          const townAsset = getTownAssetForLevel(level)
          return {
            address: address as `0x${string}`,
            burnedTotal: burnedValue,
            burnedDisplay: burnedValue.toFixed(2),
            level,
            assetSrc: townAsset.src,
            baseName: undefined,
          }
        })
        .sort((a, b) => b.burnedTotal - a.burnedTotal)
        .slice(0, MAX_TOWNS)

      setTowns(entries)
      resolveTownNames(entries)
    } catch (caughtError) {
      const message = caughtError instanceof Error ? caughtError.message : "Unable to load towns."
      if (message.includes("no backend is currently healthy")) {
        setError("Base RPC is unavailable. Set NEXT_PUBLIC_BASE_RPC_URL to a stable provider and retry.")
      } else if (message.includes("at most 1000 blocks")) {
        setError("RPC limited log range. Set NEXT_PUBLIC_SOCIAL_LOOKBACK_BLOCKS to 1000 or lower.")
      } else {
        setError(message)
      }
    } finally {
      setIsLoading(false)
    }
  }, [publicClient, decimals])

  useEffect(() => {
    fetchTowns()
  }, [fetchTowns])

  return (
    <div className="flex-1 p-4 space-y-6 max-w-2xl mx-auto">
      <div className="pt-4 text-center space-y-2">
        <div className="flex justify-center mb-4">
          <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
            <Users className="w-8 h-8 text-primary" />
          </div>
        </div>
        <h1 className="text-3xl font-bold text-primary gold-glow">Social Realm</h1>
        <p className="text-muted-foreground">See the towns rising across the chain.</p>
      </div>

      <Card className="game-card p-6 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="font-semibold text-lg text-foreground">Top Towns</h3>
            <p className="text-xs text-muted-foreground">
              Showing activity from the last {LOOKBACK_BLOCKS.toLocaleString()} blocks.
            </p>
          </div>
          <Button
            onClick={fetchTowns}
            disabled={isLoading}
            variant="outline"
            className="h-10 px-4"
          >
            {isLoading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <RefreshCcw className="w-4 h-4" />
            )}
          </Button>
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        {isLoading && towns.length === 0 && (
          <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground py-6">
            <Loader2 className="w-4 h-4 animate-spin" />
            Loading onchain towns...
          </div>
        )}

        {!isLoading && towns.length === 0 && !error && (
          <p className="text-sm text-muted-foreground text-center py-6">No towns found yet. Be the first to burn ZEN!</p>
        )}

        <div className="space-y-4">
          {towns.map((town, index) => (
            <div key={town.address} className="flex items-center gap-4 rounded-lg border border-border p-3">
              <div className="w-16 h-16 rounded-lg bg-muted/40 border border-border flex items-center justify-center overflow-hidden">
                <img
                  src={town.assetSrc}
                  alt={`Level ${town.level} town`}
                  className="w-full h-full object-contain pixel-art"
                  loading="lazy"
                />
              </div>
              <div className="flex-1">
                <p className="text-sm font-semibold text-foreground">#{index + 1} · Level {town.level}</p>
                <p className="text-xs text-muted-foreground">
                  {town.baseName ?? `${town.address.slice(0, 6)}...${town.address.slice(-4)}`}
                </p>
              </div>
              <div className="text-right">
                <p className="text-sm font-semibold text-primary">{town.burnedDisplay} ZEN</p>
                <p className="text-xs text-muted-foreground">Total burned</p>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  )
}
