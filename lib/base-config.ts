"use client"

import { base, baseSepolia } from "wagmi/chains"

export const BASE_CHAINS = [base, baseSepolia] as const

export const DEFAULT_CHAIN = process.env.NEXT_PUBLIC_BASE_CHAIN === "sepolia" ? baseSepolia : base
export const DEFAULT_CHAIN_ID = DEFAULT_CHAIN.id

export const CHAIN_LABELS: Record<number, string> = {
  [base.id]: "Base",
  [baseSepolia.id]: "Base Sepolia",
}

export const TREASURY_ADDRESS =
  (process.env.NEXT_PUBLIC_TREASURY_ADDRESS as `0x${string}` | undefined) ??
  ("0x0000000000000000000000000000000000000000" as const)

export const PAYMASTER_URLS: Record<number, string> = {
  [base.id]: process.env.NEXT_PUBLIC_BASE_PAYMASTER_URL ?? "",
  [baseSepolia.id]: process.env.NEXT_PUBLIC_BASE_SEPOLIA_PAYMASTER_URL ?? "",
}

export const getChainLabel = (chainId?: number | null) => {
  if (!chainId) return "Unknown"
  return CHAIN_LABELS[chainId] ?? `Chain ${chainId}`
}

export const getPaymasterUrl = (chainId?: number | null) => {
  if (!chainId) return ""
  return PAYMASTER_URLS[chainId] ?? ""
}
