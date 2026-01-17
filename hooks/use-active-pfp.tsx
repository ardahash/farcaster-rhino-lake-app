"use client"

import type { Address } from "viem"
import { useReadContract } from "wagmi"
import { BASE_MAINNET_CHAIN_ID } from "@/lib/base-config"
import { PROFILE_PIC_NFT_ABI } from "@/lib/contracts"
import { PROFILE_PIC_NFT_ADDRESS } from "@/lib/pfp-config"

export function useActivePfp(address?: Address | null) {
  const contractAddress = PROFILE_PIC_NFT_ADDRESS
  const enabled = Boolean(address && contractAddress)

  const result = useReadContract({
    address: contractAddress,
    abi: PROFILE_PIC_NFT_ABI,
    functionName: "activeOf",
    args: enabled ? [address] : undefined,
    chainId: BASE_MAINNET_CHAIN_ID,
    query: {
      enabled,
      refetchInterval: 15000,
    },
  })

  const activeId = typeof result.data === "bigint" ? result.data : 0n

  return {
    activeId,
    isLoading: result.isLoading,
    error: result.error ?? null,
    refetch: result.refetch,
  }
}
