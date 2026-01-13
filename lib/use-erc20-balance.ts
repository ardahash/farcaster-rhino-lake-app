"use client"

import { useMemo } from "react"
import type { Address } from "viem"
import { formatUnits } from "viem"
import { useReadContract } from "wagmi"
import { ERC20_ABI } from "@/lib/zen-burn"

type Erc20BalanceParams = {
  token: Address
  address?: Address | null
  chainId: number
  enabled?: boolean
}

export const useErc20Balance = ({ token, address, chainId, enabled = true }: Erc20BalanceParams) => {
  const canRead = Boolean(address) && enabled

  const decimalsQuery = useReadContract({
    address: token,
    abi: ERC20_ABI,
    functionName: "decimals",
    chainId,
    query: {
      enabled,
    },
  })

  const balanceQuery = useReadContract({
    address: token,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    chainId,
    query: {
      enabled: canRead,
      refetchInterval: false,
    },
  })

  const decimals = typeof decimalsQuery.data === "number" ? decimalsQuery.data : Number(decimalsQuery.data ?? 18)
  const raw = (balanceQuery.data as bigint | undefined) ?? 0n

  const formatted = useMemo(() => {
    if (!canRead) return "0"
    return formatUnits(raw, decimals)
  }, [raw, decimals, canRead])

  return {
    raw,
    formatted,
    decimals,
    isLoading: decimalsQuery.isLoading || balanceQuery.isLoading,
    error: decimalsQuery.error ?? balanceQuery.error ?? null,
    refetch: balanceQuery.refetch,
  }
}
