"use client"

import type { Address } from "viem"
import { useReadContract } from "wagmi"
import { BASE_MAINNET_CHAIN_ID } from "@/lib/base-config"
import { ERC20_ABI } from "@/lib/contracts"

type AllowanceParams = {
  token: Address
  owner?: Address | null
  spender?: Address | null
  enabled?: boolean
}

export function useTokenAllowance({ token, owner, spender, enabled = true }: AllowanceParams) {
  const result = useReadContract({
    address: token,
    abi: ERC20_ABI,
    functionName: "allowance",
    args: owner && spender ? [owner, spender] : undefined,
    chainId: BASE_MAINNET_CHAIN_ID,
    query: {
      enabled: Boolean(enabled && owner && spender),
      refetchInterval: 15000,
    },
  })

  const allowance = typeof result.data === "bigint" ? result.data : 0n

  return {
    allowance,
    isLoading: result.isLoading,
    error: result.error ?? null,
    refetch: result.refetch,
  }
}
