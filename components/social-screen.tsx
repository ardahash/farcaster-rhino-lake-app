"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { useBaseAuth } from "@/lib/base-auth"
import { resolveBaseName } from "@/lib/base-names"
import { BASE_MAINNET_CHAIN_ID } from "@/lib/base-config"
import { CONTRACTS, CITY_NFT_ABI, ERC20_ABI, GAME_ABI } from "@/lib/contracts"
import { getTownAssetForLevel } from "@/lib/game-state"
import { useCityId } from "@/hooks/use-city-id"
import { useCityState } from "@/hooks/use-city-state"
import { useErc20Balance } from "@/lib/use-erc20-balance"
import { Loader2, RefreshCcw, Users, Swords } from "lucide-react"
import { formatUnits, encodeFunctionData, zeroAddress } from "viem"
import { usePublicClient, useReadContract, useSendTransaction, useSwitchChain } from "wagmi"

const resolveLookbackBlocks = () => {
  const raw = Number.parseInt(process.env.NEXT_PUBLIC_SOCIAL_LOOKBACK_BLOCKS ?? "", 10)
  if (Number.isFinite(raw) && raw > 0) return Math.min(raw, 5000)
  return 2000
}

const LOOKBACK_BLOCKS = resolveLookbackBlocks()
const MAX_LOG_BLOCK_RANGE = 1000n
const MAX_TOWNS = 20
const TRANSFER_EVENT =
  CITY_NFT_ABI.find((item) => item.type === "event" && item.name === "Transfer") ?? CITY_NFT_ABI[2]

type TownEntry = {
  cityId: bigint
  owner: `0x${string}`
  barLocked: bigint
  rhinoLocked: bigint
  level: number
  hits: number
  dead: boolean
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

const normalizeCityState = (
  value:
    | readonly [bigint, bigint, number, boolean, bigint]
    | { barLocked: bigint; rhinoLocked: bigint; hits: number; dead: boolean }
    | undefined
    | null,
) => {
  if (!value) {
    return { barLocked: 0n, rhinoLocked: 0n, hits: 0, dead: false }
  }
  if (Array.isArray(value)) {
    const [barLocked, rhinoLocked, hits, dead] = value
    return { barLocked, rhinoLocked, hits, dead }
  }
  return value
}

export function SocialScreen() {
  const { address, chainId, isAuthenticated, signIn } = useBaseAuth()
  const publicClient = usePublicClient({ chainId: BASE_MAINNET_CHAIN_ID })
  const { sendTransactionAsync, isPending: isTxPending } = useSendTransaction()
  const { switchChainAsync, isPending: isSwitching } = useSwitchChain()

  const { cityId } = useCityId(address)
  const { cityState, refetch: refetchCityState } = useCityState(cityId)
  const [towns, setTowns] = useState<TownEntry[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [defenderCityId, setDefenderCityId] = useState("")
  const [isAttacking, setIsAttacking] = useState(false)

  const rhinoBalance = useErc20Balance({
    token: CONTRACTS.RHINO,
    address,
    chainId: BASE_MAINNET_CHAIN_ID,
    enabled: Boolean(isAuthenticated && address),
  })

  const { data: barDecimals } = useReadContract({
    address: CONTRACTS.BAR,
    abi: ERC20_ABI,
    functionName: "decimals",
    chainId: BASE_MAINNET_CHAIN_ID,
  })

  const { data: rhinoDecimals } = useReadContract({
    address: CONTRACTS.RHINO,
    abi: ERC20_ABI,
    functionName: "decimals",
    chainId: BASE_MAINNET_CHAIN_ID,
  })

  const { data: attackCooldownRaw } = useReadContract({
    address: CONTRACTS.GAME,
    abi: GAME_ABI,
    functionName: "attackCooldown",
    chainId: BASE_MAINNET_CHAIN_ID,
  })

  const { data: attackCostRaw } = useReadContract({
    address: CONTRACTS.GAME,
    abi: GAME_ABI,
    functionName: "attackCostRhino",
    chainId: BASE_MAINNET_CHAIN_ID,
  })

  const resolvedBarDecimals = Number(barDecimals ?? 18)
  const resolvedRhinoDecimals = Number(rhinoDecimals ?? 18)

  const resolveTownNames = useCallback(
    async (entries: TownEntry[]) => {
      if (!publicClient) return
      const nextEntries = [...entries]
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
      setTowns(nextEntries)
    },
    [publicClient],
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

      const entries: TownEntry[] = []
      const ids = Array.from(cityIds)
      for (let i = 0; i < ids.length; i += 5) {
        const chunkIds = ids.slice(i, i + 5)
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
          {
            address: CONTRACTS.GAME,
            abi: GAME_ABI,
            functionName: "levelOf" as const,
            args: [id],
          },
        ])

        const results = await publicClient.multicall({
          contracts,
          allowFailure: true,
        })

        for (let index = 0; index < chunkIds.length; index += 1) {
          const ownerResult = results[index * 3]
          const cityResult = results[index * 3 + 1]
          const levelResult = results[index * 3 + 2]

          if (ownerResult.status !== "success" || !ownerResult.result) continue

          const owner = ownerResult.result as `0x${string}`
          if (!owner || owner === zeroAddress) continue

          const cityState = normalizeCityState(
            cityResult.status === "success" ? (cityResult.result as any) : null,
          )
          const level = levelResult.status === "success" ? Number(levelResult.result ?? 0) : 0

          entries.push({
            cityId: chunkIds[index],
            owner,
            barLocked: cityState.barLocked ?? 0n,
            rhinoLocked: cityState.rhinoLocked ?? 0n,
            level,
            hits: cityState.hits ?? 0,
            dead: cityState.dead ?? false,
            baseName: undefined,
          })
        }
      }

      const sorted = entries
        .sort((a, b) => (a.barLocked > b.barLocked ? -1 : a.barLocked < b.barLocked ? 1 : 0))
        .slice(0, MAX_TOWNS)

      setTowns(sorted)
      resolveTownNames(sorted)
    } catch (caughtError) {
      const message = caughtError instanceof Error ? caughtError.message : "Unable to load cities."
      if (message.includes("at most 1000 blocks")) {
        setError("RPC limited log range. Set NEXT_PUBLIC_SOCIAL_LOOKBACK_BLOCKS to 1000 or lower.")
      } else {
        setError(message)
      }
    } finally {
      setIsLoading(false)
    }
  }, [publicClient, resolveTownNames])

  useEffect(() => {
    fetchTowns()
  }, [fetchTowns])

  const ensureBaseNetwork = async () => {
    const activeChainId = chainId ?? BASE_MAINNET_CHAIN_ID
    if (activeChainId !== BASE_MAINNET_CHAIN_ID) {
      await switchChainAsync({ chainId: BASE_MAINNET_CHAIN_ID })
      throw new Error("Switching to Base mainnet. Please try again.")
    }
    return BASE_MAINNET_CHAIN_ID
  }

  const ensureRhinoAllowance = async (amount: bigint) => {
    if (!publicClient || !address) {
      throw new Error("RPC not ready.")
    }
    const allowance = (await publicClient.readContract({
      address: CONTRACTS.RHINO,
      abi: ERC20_ABI,
      functionName: "allowance",
      args: [address, CONTRACTS.GAME],
    })) as bigint

    if (allowance >= amount) return

    const approvalTx = await sendTransactionAsync({
      chainId: BASE_MAINNET_CHAIN_ID,
      account: address,
      to: CONTRACTS.RHINO,
      data: encodeFunctionData({
        abi: ERC20_ABI,
        functionName: "approve",
        args: [CONTRACTS.GAME, amount],
      }),
    })
    await publicClient.waitForTransactionReceipt({ hash: approvalTx })
  }

  const handleAttack = async () => {
    setIsAttacking(true)
    setError(null)
    try {
      const defender = Number.parseInt(defenderCityId, 10)
      if (!defender || defender <= 0) {
        throw new Error("Enter a valid defender city ID.")
      }

      if (!isAuthenticated || !address) {
        await signIn("coinbase")
        return
      }

      if (cityId <= 0n) {
        throw new Error("Mint a city before attacking.")
      }

      if (cityState.dead) {
        throw new Error("Your city is dead and cannot attack.")
      }

      if (BigInt(defender) === cityId) {
        throw new Error("You cannot attack your own city.")
      }

      const lastAttackAt = Number(cityState.lastAttackAt)
      const now = Math.floor(Date.now() / 1000)
      const attackCooldown = Number(attackCooldownRaw ?? 0)
      const cooldownEnds = lastAttackAt + attackCooldown
      if (cooldownEnds > now) {
        const remaining = cooldownEnds - now
        throw new Error(`Cooldown active. Try again in ${remaining}s.`)
      }

      const attackCostRhino = (attackCostRaw as bigint | undefined) ?? 0n
      if (rhinoBalance.isLoading) {
        throw new Error("RHINO balance is still loading.")
      }
      if (attackCostRhino > 0n && rhinoBalance.raw < attackCostRhino) {
        throw new Error("Not enough RHINO for the attack cost.")
      }

      await ensureBaseNetwork()
      if (attackCostRhino > 0n) {
        await ensureRhinoAllowance(attackCostRhino)
      }

      const txHash = await sendTransactionAsync({
        chainId: BASE_MAINNET_CHAIN_ID,
        account: address,
        to: CONTRACTS.GAME,
        data: encodeFunctionData({
          abi: GAME_ABI,
          functionName: "attack",
          args: [cityId, BigInt(defender)],
        }),
      })
      if (publicClient) {
        await publicClient.waitForTransactionReceipt({ hash: txHash })
      }
      setDefenderCityId("")
      refetchCityState()
      fetchTowns()
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Attack failed.")
    } finally {
      setIsAttacking(false)
    }
  }

  const attackCostDisplay = useMemo(() => {
    const cost = (attackCostRaw as bigint | undefined) ?? 0n
    if (!cost || cost <= 0n) return "0"
    return formatUnits(cost, resolvedRhinoDecimals)
  }, [attackCostRaw, resolvedRhinoDecimals])
  const isOnBase = !chainId || chainId === BASE_MAINNET_CHAIN_ID

  return (
    <div className="flex-1 p-4 space-y-6 max-w-2xl mx-auto">
      <div className="pt-4 text-center space-y-2">
        <div className="flex justify-center mb-4">
          <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
            <Users className="w-8 h-8 text-primary" />
          </div>
        </div>
        <h1 className="text-3xl font-bold text-primary gold-glow">Social Realm</h1>
        <p className="text-muted-foreground">Scout cities and prepare for war.</p>
      </div>

      <Card className="game-card p-6 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="font-semibold text-lg text-foreground">Top Cities</h3>
            <p className="text-xs text-muted-foreground">
              Showing activity from the last {LOOKBACK_BLOCKS.toLocaleString()} blocks.
            </p>
          </div>
          <Button onClick={fetchTowns} disabled={isLoading} variant="outline" className="h-10 px-4">
            {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCcw className="w-4 h-4" />}
          </Button>
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        {isLoading && towns.length === 0 && (
          <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground py-6">
            <Loader2 className="w-4 h-4 animate-spin" />
            Loading onchain cities...
          </div>
        )}

        {!isLoading && towns.length === 0 && !error && (
          <p className="text-sm text-muted-foreground text-center py-6">No cities found yet. Mint the first!</p>
        )}

        <div className="space-y-4">
          {towns.map((town, index) => {
            const townAsset = getTownAssetForLevel(town.level || 1)
            return (
              <div key={`${town.owner}-${town.cityId}`} className="flex items-center gap-4 rounded-lg border border-border p-3">
                <div className="w-16 h-16 rounded-lg bg-muted/40 border border-border flex items-center justify-center overflow-hidden">
                  <img
                    src={townAsset.src}
                    alt={`Level ${town.level} town`}
                    className="w-full h-full object-contain pixel-art"
                    loading="lazy"
                  />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-semibold text-foreground">
                    #{index + 1} - City {town.cityId.toString()} (Level {town.level})
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {town.baseName ?? `${town.owner.slice(0, 6)}...${town.owner.slice(-4)}`}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Hits: {town.hits} {town.dead ? "- Dead" : ""}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold text-primary">
                    {formatTokenValue(town.barLocked, resolvedBarDecimals)} BAR
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatTokenValue(town.rhinoLocked, resolvedRhinoDecimals)} RHINO
                  </p>
                </div>
              </div>
            )
          })}
        </div>
      </Card>

      <Card className="game-card p-6 space-y-4">
        <div className="flex items-center gap-2 text-lg font-semibold text-foreground">
          <Swords className="w-5 h-5 text-primary" />
          Attack a City
        </div>
        <p className="text-sm text-muted-foreground">
          Attack costs {attackCostDisplay} RHINO and respects cooldowns. Make sure you have a city first.
        </p>
        {!isOnBase && isAuthenticated && (
          <p className="text-xs text-amber-500">Switch to Base mainnet to attack.</p>
        )}
        <div className="space-y-2">
          <label className="text-xs font-semibold text-muted-foreground">Defender City ID</label>
          <Input
            type="number"
            min="1"
            step="1"
            value={defenderCityId}
            onChange={(event) => setDefenderCityId(event.target.value)}
            className="h-11"
          />
        </div>
        <Button
          onClick={handleAttack}
          disabled={isAttacking || isTxPending || isSwitching || !defenderCityId || !isOnBase}
          className="w-full h-12 text-base font-semibold"
        >
          {isAttacking ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Attacking...
            </>
          ) : (
            "Attack"
          )}
        </Button>
      </Card>
    </div>
  )
}
