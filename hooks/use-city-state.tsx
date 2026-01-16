"use client"

import { useMemo } from "react"
import { useQuery } from "@tanstack/react-query"
import { usePublicClient } from "wagmi"
import { BASE_MAINNET_CHAIN_ID } from "@/lib/base-config"
import { CONTRACTS, GAME_ABI } from "@/lib/contracts"

type RawCityState =
  | readonly [bigint, bigint, number, boolean, bigint]
  | {
      barLocked: bigint
      rhinoLocked: bigint
      hits: number
      dead: boolean
      lastAttackAt: bigint
    }

const normalizeCityState = (value: RawCityState | undefined | null) => {
  if (!value) {
    return {
      barLocked: 0n,
      rhinoLocked: 0n,
      hits: 0,
      dead: false,
      lastAttackAt: 0n,
    }
  }
  if (Array.isArray(value)) {
    const [barLocked, rhinoLocked, hits, dead, lastAttackAt] = value
    return {
      barLocked,
      rhinoLocked,
      hits,
      dead,
      lastAttackAt: BigInt(lastAttackAt),
    }
  }
  return {
    barLocked: value.barLocked,
    rhinoLocked: value.rhinoLocked,
    hits: value.hits,
    dead: value.dead,
    lastAttackAt: BigInt(value.lastAttackAt),
  }
}

export function useCityState(cityId: bigint) {
  const publicClient = usePublicClient({ chainId: BASE_MAINNET_CHAIN_ID })
  const enabled = Boolean(publicClient && cityId && cityId > 0n)

  const query = useQuery({
    queryKey: ["city-state", BASE_MAINNET_CHAIN_ID, cityId.toString()],
    enabled,
    refetchInterval: 15000,
    queryFn: async () => {
      if (!publicClient) {
        throw new Error("RPC not ready.")
      }
      const [cityResult, levelResult, claimableResult, cooldownResult, costResult] =
        await publicClient.multicall({
          contracts: [
            {
              address: CONTRACTS.GAME,
              abi: GAME_ABI,
              functionName: "cities",
              args: [cityId],
            },
            {
              address: CONTRACTS.GAME,
              abi: GAME_ABI,
              functionName: "levelOf",
              args: [cityId],
            },
            {
              address: CONTRACTS.GAME,
              abi: GAME_ABI,
              functionName: "ethClaimable",
              args: [cityId],
            },
            {
              address: CONTRACTS.GAME,
              abi: GAME_ABI,
              functionName: "attackCooldown",
            },
            {
              address: CONTRACTS.GAME,
              abi: GAME_ABI,
              functionName: "attackCostRhino",
            },
          ],
          allowFailure: true,
        })

      const cityState = normalizeCityState(
        cityResult.status === "success" ? (cityResult.result as RawCityState) : null,
      )
      const level = levelResult.status === "success" ? Number(levelResult.result ?? 0) : 0
      const ethClaimable = claimableResult.status === "success" ? (claimableResult.result as bigint) : 0n
      const attackCooldown = cooldownResult.status === "success" ? Number(cooldownResult.result ?? 0) : 0
      const attackCostRhino = costResult.status === "success" ? (costResult.result as bigint) : 0n

      return {
        cityState,
        level,
        ethClaimable,
        attackCooldown,
        attackCostRhino,
      }
    },
  })

  return useMemo(
    () => ({
      cityState: query.data?.cityState ?? normalizeCityState(null),
      level: query.data?.level ?? 0,
      ethClaimable: query.data?.ethClaimable ?? 0n,
      attackCooldown: query.data?.attackCooldown ?? 0,
      attackCostRhino: query.data?.attackCostRhino ?? 0n,
      isLoading: query.isLoading,
      error: query.error ?? null,
      refetch: query.refetch,
    }),
    [
      query.data?.attackCooldown,
      query.data?.attackCostRhino,
      query.data?.cityState,
      query.data?.ethClaimable,
      query.data?.level,
      query.error,
      query.isLoading,
      query.refetch,
    ],
  )
}
