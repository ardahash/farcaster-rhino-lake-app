"use client"

import { useMemo } from "react"
import { useBaseAuth } from "@/lib/base-auth"
import { BASE_MAINNET_CHAIN_ID } from "@/lib/base-config"

export function useConnectedAddress() {
  const { address, chainId, isAuthenticated, isConnecting } = useBaseAuth()

  return useMemo(
    () => ({
      address,
      chainId,
      isAuthenticated,
      isConnecting,
      isOnBase: chainId === BASE_MAINNET_CHAIN_ID,
    }),
    [address, chainId, isAuthenticated, isConnecting],
  )
}
