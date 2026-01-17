"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { resolveBaseName } from "@/lib/base-names"
import { BASE_MAINNET_CHAIN_ID } from "@/lib/base-config"
import { CITY_NFT_ABI, CONTRACTS, ERC20_ABI, GAME_ABI } from "@/lib/contracts"
import { formatUnits, zeroAddress } from "viem"
import { usePublicClient, useReadContract } from "wagmi"
import { Loader2, RefreshCcw, Users } from "lucide-react"

const resolveLookbackBlocks = () => {
  const raw = Number.parseInt(process.env.NEXT_PUBLIC_SOCIAL_LOOKBACK_BLOCKS ?? "", 10)
  if (Number.isFinite(raw) && raw > 0) return Math.min(raw, 5000)
  return 2000
}

const LOOKBACK_BLOCKS = resolveLookbackBlocks()
const MAX_LOG_BLOCK_RANGE = 1000n
const MAX_ENTRIES = 20
const TRANSFER_EVENT =
  CITY_NFT_ABI.find((item) => item.type === "event" && item.name === "Transfer") ?? CITY_NFT_ABI[2]

type LeaderEntry = {
  cityId: bigint
  owner: `0x${string}`
  barLocked: bigint
  baseName?: string | null
}

const formatTokenValue = (raw: bigint, decimals: number) => {
  try {
    const value = Number(formatUnits(raw, decimals))
    if (!Number.isFinite(value)) return "--"
    return value.toLocaleString(undefined, { maximumFractionDigits: 4 })
  } catch {
    return "--"
  }
}

export function SocialScreen() {
  const publicClient = usePublicClient({ chainId: BASE_MAINNET_CHAIN_ID })
  const [entries, setEntries] = useState<LeaderEntry[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const { data: barDecimals } = useReadContract({
    address: CONTRACTS.BAR,
    abi: ERC20_ABI,
    functionName: "decimals",
    chainId: BASE_MAINNET_CHAIN_ID,
  })

  const resolvedBarDecimals = Number(barDecimals ?? 18)

  const resolveNames = useCallback(
    async (items: LeaderEntry[]) => {
      if (!publicClient) return
      const nextEntries = [...items]
      for (let i = 0; i < nextEntries.length; i += 1) {
        const entry = nextEntries[i]
        if (entry.baseName !== undefined) continue
        try {
          const name = await resolveBaseName({ address: entry.owner, publicClient })
          nextEntries[i] = { ...entry, baseName: name }
        } catch {
          nextEntries[i] = { ...entry, baseName: null }
        }
      }
      setEntries(nextEntries)
    },
    [publicClient],
  )

  const fetchLeaderboard = useCallback(async () => {
    if (!publicClient) return
    setIsLoading(true)
    setError(null)
    try {
      const latestBlock = await publicClient.getBlockNumber()
      const lookback = BigInt(LOOKBACK_BLOCKS)
      const fromBlock = latestBlock > lookback ? latestBlock - lookback : 0n
      const logs = []
      for (let startBlock = fromBlock; startBlock <= latestBlock; startBlock += MAX_LOG_BLOCK_RANGE) {
        const endBlock = startBlock + MAX_LOG_BLOCK_RANGE - 1n
        const chunk = await publicClient.getLogs({
          address: CONTRACTS.CITY_NFT,
          event: TRANSFER_EVENT,
          fromBlock: startBlock,
          toBlock: endBlock > latestBlock ? latestBlock : endBlock,
        })
        logs.push(...chunk)
      }

      const cityIds = new Set<bigint>()
      for (const log of logs) {
        if (!log.args || typeof log.args.tokenId === "undefined") continue
        cityIds.add(log.args.tokenId as bigint)
      }

      const ids = Array.from(cityIds)
      const items: LeaderEntry[] = []
      for (let i = 0; i < ids.length; i += 6) {
        const chunkIds = ids.slice(i, i + 6)
        const contracts = chunkIds.flatMap((id) => [
          {
            address: CONTRACTS.CITY_NFT,
            abi: CITY_NFT_ABI,
            functionName: "ownerOf" as const,
            args: [id],
          },
          {
            address: CONTRACTS.GAME,
            abi: GAME_ABI,
            functionName: "cities" as const,
            args: [id],
          },
        ])

        const results = await publicClient.multicall({
          contracts,
          allowFailure: true,
        })

        for (let index = 0; index < chunkIds.length; index += 1) {
          const ownerResult = results[index * 2]
          const cityResult = results[index * 2 + 1]
          if (ownerResult.status !== "success" || !ownerResult.result) continue

          const owner = ownerResult.result as `0x${string}`
          if (!owner || owner === zeroAddress) continue

          let barLocked = 0n
          if (cityResult.status === "success" && cityResult.result) {
            const state = cityResult.result as
              | readonly [bigint, bigint, number, boolean, bigint]
              | { barLocked: bigint }
            barLocked = Array.isArray(state) ? state[0] : state.barLocked
          }

          items.push({
            cityId: chunkIds[index],
            owner,
            barLocked,
            baseName: undefined,
          })
        }
      }

      const sorted = items
        .sort((a, b) => (a.barLocked > b.barLocked ? -1 : a.barLocked < b.barLocked ? 1 : 0))
        .slice(0, MAX_ENTRIES)

      setEntries(sorted)
      resolveNames(sorted)
    } catch (caughtError) {
      const message = caughtError instanceof Error ? caughtError.message : "Unable to load leaderboard."
      if (message.includes("at most 1000 blocks")) {
        setError("RPC limited log range. Set NEXT_PUBLIC_SOCIAL_LOOKBACK_BLOCKS to 1000 or lower.")
      } else {
        setError(message)
      }
    } finally {
      setIsLoading(false)
    }
  }, [publicClient, resolveNames])

  useEffect(() => {
    fetchLeaderboard()
  }, [fetchLeaderboard])

  const heading = useMemo(() => {
    return `Showing activity from the last ${LOOKBACK_BLOCKS.toLocaleString()} blocks.`
  }, [])

  return (
    <div className="flex-1 p-4 space-y-6 max-w-2xl mx-auto">
      <div className="pt-4 text-center space-y-2">
        <div className="flex justify-center mb-4">
          <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
            <Users className="w-8 h-8 text-primary" />
          </div>
        </div>
        <h1 className="text-3xl font-bold text-primary gold-glow">City Power Leaderboard</h1>
        <p className="text-muted-foreground">Top cities ranked by BAR locked.</p>
      </div>

      <Card className="game-card p-6 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="font-semibold text-lg text-foreground">Top Cities by BAR Locked</h3>
            <p className="text-xs text-muted-foreground">{heading}</p>
          </div>
          <Button onClick={fetchLeaderboard} disabled={isLoading} variant="outline" className="h-10 px-4">
            {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCcw className="w-4 h-4" />}
          </Button>
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        {isLoading && entries.length === 0 && (
          <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground py-6">
            <Loader2 className="w-4 h-4 animate-spin" />
            Loading leaderboard...
          </div>
        )}

        {!isLoading && entries.length === 0 && !error && (
          <p className="text-sm text-muted-foreground text-center py-6">No cities found yet. Mint the first!</p>
        )}

        <div className="space-y-3">
          {entries.map((entry, index) => {
            const shortAddress = `${entry.owner.slice(0, 6)}...${entry.owner.slice(-4)}`
            return (
              <div
                key={`${entry.owner}-${entry.cityId}`}
                className="flex items-center gap-4 rounded-lg border border-border p-3"
              >
                <div className="text-lg font-semibold text-foreground w-8 text-center">#{index + 1}</div>
                <div className="flex-1">
                  <p className="text-sm font-semibold text-foreground">City {entry.cityId.toString()}</p>
                  {entry.baseName ? (
                    <>
                      <p className="text-xs text-muted-foreground">{entry.baseName}</p>
                      <p className="text-[11px] text-muted-foreground">{shortAddress}</p>
                    </>
                  ) : (
                    <p className="text-xs text-muted-foreground">{shortAddress}</p>
                  )}
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold text-primary">
                    {formatTokenValue(entry.barLocked, resolvedBarDecimals)} BAR
                  </p>
                  <p className="text-xs text-muted-foreground">City Power</p>
                </div>
              </div>
            )
          })}
        </div>
      </Card>
    </div>
  )
}
