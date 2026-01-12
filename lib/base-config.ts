"use client"

import { base, baseSepolia } from "wagmi/chains"

export const BASE_CHAINS = [base, baseSepolia] as const

export const DEFAULT_CHAIN = process.env.NEXT_PUBLIC_BASE_CHAIN === "sepolia" ? baseSepolia : base
export const DEFAULT_CHAIN_ID = DEFAULT_CHAIN.id

export const CHAIN_LABELS: Record<number, string> = {
  [base.id]: "Base",
  [baseSepolia.id]: "Base Sepolia",
}

export const PAYMASTER_PROXY_PATH = "/api/paymaster"

const DEFAULT_APP_ORIGIN =
  process.env.NEXT_PUBLIC_PAYMASTER_PROXY_URL ??
  process.env.NEXT_PUBLIC_APP_URL ??
  process.env.NEXT_PUBLIC_SITE_URL ??
  "http://localhost:3000"

const normalizeOrigin = (origin: string) => origin.replace(/\/$/, "")

const resolvePaymasterOrigin = () => {
  const preferred = normalizeOrigin(DEFAULT_APP_ORIGIN)
  if (preferred.startsWith("https://")) {
    return preferred
  }

  if (typeof window !== "undefined") {
    const runtimeOrigin = normalizeOrigin(window.location.origin)
    if (runtimeOrigin.startsWith("https://")) {
      return runtimeOrigin
    }
  }

  return ""
}

export const getChainLabel = (chainId?: number | null) => {
  if (!chainId) return "Unknown"
  return CHAIN_LABELS[chainId] ?? `Chain ${chainId}`
}

export const getPaymasterUrl = (chainId?: number | null) => {
  if (!chainId) return ""
  const origin = resolvePaymasterOrigin()
  if (!origin) {
    return ""
  }
  return `${origin}${PAYMASTER_PROXY_PATH}?chainId=${chainId}`
}
