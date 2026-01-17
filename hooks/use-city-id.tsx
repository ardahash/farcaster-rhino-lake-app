"use client"

import { useEffect, useRef, useState } from "react"
import type { Address } from "viem"
import { useReadContract } from "wagmi"
import { CITY_NFT_ABI, CONTRACTS } from "@/lib/contracts"
import { BASE_MAINNET_CHAIN_ID } from "@/lib/base-config"

export function useCityId(address?: Address | null) {
  const [scopedCityId, setScopedCityId] = useState(0n)
  const lastAddressRef = useRef<Address | null | undefined>(address)
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

  useEffect(() => {
    if (lastAddressRef.current !== address) {
      lastAddressRef.current = address
      setScopedCityId(0n)
    }
  }, [address])

  useEffect(() => {
    if (!address) {
      setScopedCityId(0n)
      return
    }
    if (typeof result.data === "bigint") {
      setScopedCityId(result.data)
    }
  }, [address, result.data])

  return {
    cityId: scopedCityId,
    isLoading: result.isLoading,
    error: result.error ?? null,
    refetch: result.refetch,
  }
}
