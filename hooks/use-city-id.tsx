"use client"

import type { Address } from "viem"
import { useReadContract } from "wagmi"
import { CITY_NFT_ABI, CONTRACTS } from "@/lib/contracts"
import { BASE_MAINNET_CHAIN_ID } from "@/lib/base-config"

export function useCityId(address?: Address | null) {
  const result = useReadContract({
    address: CONTRACTS.CITY_NFT,
    abi: CITY_NFT_ABI,
    functionName: "cityOf",
    args: address ? [address] : undefined,
    chainId: BASE_MAINNET_CHAIN_ID,
    query: {
      enabled: Boolean(address),
    },
  })

  const cityId = typeof result.data === "bigint" ? result.data : 0n

  return {
    cityId,
    isLoading: result.isLoading,
    error: result.error ?? null,
    refetch: result.refetch,
  }
}
