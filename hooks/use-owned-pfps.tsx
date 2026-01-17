"use client"

import { useMemo } from "react"
import type { Address } from "viem"
import { useReadContract } from "wagmi"
import { BASE_MAINNET_CHAIN_ID } from "@/lib/base-config"
import { PROFILE_PIC_NFT_ABI } from "@/lib/contracts"
import { PROFILE_PIC_NFT_ADDRESS } from "@/lib/pfp-config"
import { PFP_TOKEN_IDS } from "@/lib/pfp-catalog"

export function useOwnedPfps(address?: Address | null) {
  const contractAddress = PROFILE_PIC_NFT_ADDRESS
  const tokenIds = useMemo(() => PFP_TOKEN_IDS.map((id) => BigInt(id)), [])
  const accounts = useMemo(() => (address ? tokenIds.map(() => address) : []), [address, tokenIds])
  const enabled = Boolean(address && contractAddress)

  const result = useReadContract({
    address: contractAddress,
    abi: PROFILE_PIC_NFT_ABI,
    functionName: "balanceOfBatch",
    args: enabled ? [accounts, tokenIds] : undefined,
    chainId: BASE_MAINNET_CHAIN_ID,
    query: {
      enabled,
      refetchInterval: 15000,
    },
  })

  const rawBalances = (Array.isArray(result.data) ? result.data : []) as bigint[]
  const balances = PFP_TOKEN_IDS.map((_, index) => rawBalances[index] ?? 0n)

  return {
    balances,
    isLoading: result.isLoading,
    error: result.error ?? null,
    refetch: result.refetch,
  }
}
