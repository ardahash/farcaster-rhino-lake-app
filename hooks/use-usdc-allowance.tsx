"use client"

import type { Address } from "viem"
import { useTokenAllowance } from "@/hooks/use-token-allowance"
import { USDC_ADDRESS } from "@/lib/pfp-config"

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as Address

export function useUsdcAllowance(owner?: Address | null, spender?: Address | null, enabled = true) {
  const token = USDC_ADDRESS ?? ZERO_ADDRESS
  const allowanceState = useTokenAllowance({
    token,
    owner,
    spender,
    enabled: Boolean(enabled && USDC_ADDRESS),
  })

  return allowanceState
}
