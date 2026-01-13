"use client"

import { useMemo } from "react"
import { useQuery } from "@tanstack/react-query"
import type { Address } from "viem"
import { formatUnits } from "viem"
import { usePublicClient } from "wagmi"
import { ERC20_ABI } from "@/lib/zen-burn"

type Erc20BalanceParams = {
  token: Address
  address?: Address | null
  chainId: number
  enabled?: boolean
}

type NativeBalanceParams = {
  address?: Address | null
  chainId: number
  enabled?: boolean
}

const REFRESH_INTERVAL_MS = 15000

export const useErc20Balance = ({ token, address, chainId, enabled = true }: Erc20BalanceParams) => {
  const publicClient = usePublicClient({ chainId })
  const canRead = Boolean(address && enabled && publicClient)

  const balanceQuery = useQuery({
    queryKey: ["erc20-balance", token, address, chainId],
    queryFn: async () => {
      if (!publicClient || !address) {
        throw new Error("RPC not ready.")
      }
      const results = await publicClient.multicall({
        contracts: [
          {
            address: token,
            abi: ERC20_ABI,
            functionName: "decimals",
          },
          {
            address: token,
            abi: ERC20_ABI,
            functionName: "balanceOf",
            args: [address],
          },
        ],
        allowFailure: true,
      })

      const decimalsResult = results[0]?.status === "success" ? results[0].result : 18
      const balanceResult = results[1]?.status === "success" ? results[1].result : 0n

      return {
        decimals: Number(decimalsResult ?? 18),
        balance: (balanceResult as bigint | undefined) ?? 0n,
      }
    },
    enabled: canRead,
    refetchInterval: REFRESH_INTERVAL_MS,
    staleTime: 1000 * 60 * 2,
    retry: 2,
  })

  const decimals = balanceQuery.data?.decimals ?? 18
  const raw = balanceQuery.data?.balance ?? 0n

  const formatted = useMemo(() => {
    if (!canRead) return "0"
    return formatUnits(raw, decimals)
  }, [raw, decimals, canRead])

  return {
    raw,
    formatted,
    decimals,
    isLoading: balanceQuery.isLoading,
    error: balanceQuery.error ?? null,
    refetch: balanceQuery.refetch,
  }
}

export const useNativeBalance = ({ address, chainId, enabled = true }: NativeBalanceParams) => {
  const publicClient = usePublicClient({ chainId })
  const canRead = Boolean(address && enabled && publicClient)

  const balanceQuery = useQuery({
    queryKey: ["native-balance", address, chainId],
    queryFn: async () => {
      if (!publicClient || !address) {
        throw new Error("RPC not ready.")
      }
      return publicClient.getBalance({ address })
    },
    enabled: canRead,
    refetchInterval: REFRESH_INTERVAL_MS,
    retry: 2,
  })

  const raw = balanceQuery.data ?? 0n
  const formatted = useMemo(() => {
    if (!canRead) return "0"
    return formatUnits(raw, 18)
  }, [raw, canRead])

  return {
    raw,
    formatted,
    isLoading: balanceQuery.isLoading,
    error: balanceQuery.error ?? null,
    refetch: balanceQuery.refetch,
  }
}
