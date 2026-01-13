"use client"

import type { Address, PublicClient } from "viem"
import {
  AERODROME_CLASSIC_FACTORY_ADDRESS,
  AERODROME_CLASSIC_ROUTER_ABI,
  AERODROME_CLASSIC_ROUTER_ADDRESS,
  AERODROME_SLIPSTREAM_QUOTER_ABI,
  AERODROME_SLIPSTREAM_QUOTER_ADDRESS,
  SLIPSTREAM_FEE_TIERS,
} from "@/lib/aerodrome"

export type SwapRouteChoice =
  | { mode: "slipstream"; fee: number; amountOut: bigint }
  | { mode: "classic"; stable: boolean; amountOut: bigint }

export const buildClassicRoute = (tokenIn: Address, tokenOut: Address, stable: boolean) => [
  {
    from: tokenIn,
    to: tokenOut,
    stable,
    factory: AERODROME_CLASSIC_FACTORY_ADDRESS,
  },
]

export const selectBestRoute = async ({
  publicClient,
  amountIn,
  tokenIn,
  tokenOut,
  stable = false,
}: {
  publicClient: PublicClient
  amountIn: bigint
  tokenIn: Address
  tokenOut: Address
  stable?: boolean
}): Promise<SwapRouteChoice | null> => {
  if (amountIn <= 0n) {
    return null
  }

  if (AERODROME_SLIPSTREAM_QUOTER_ADDRESS) {
    let bestQuote: { fee: number; amountOut: bigint } | null = null
    for (const fee of SLIPSTREAM_FEE_TIERS) {
      try {
        const amountOut = (await publicClient.readContract({
          address: AERODROME_SLIPSTREAM_QUOTER_ADDRESS,
          abi: AERODROME_SLIPSTREAM_QUOTER_ABI,
          functionName: "quoteExactInputSingle",
          args: [tokenIn, tokenOut, fee, amountIn, 0n],
        })) as bigint

        if (amountOut > 0n && (!bestQuote || amountOut > bestQuote.amountOut)) {
          bestQuote = { fee, amountOut }
        }
      } catch {
        // Ignore failing fee tiers.
      }
    }

    if (bestQuote) {
      return { mode: "slipstream", ...bestQuote }
    }
  }

  try {
    const amounts = (await publicClient.readContract({
      address: AERODROME_CLASSIC_ROUTER_ADDRESS,
      abi: AERODROME_CLASSIC_ROUTER_ABI,
      functionName: "getAmountsOut",
      args: [amountIn, buildClassicRoute(tokenIn, tokenOut, stable)],
    })) as bigint[]

    const amountOut = amounts[amounts.length - 1] ?? 0n
    if (amountOut > 0n) {
      return { mode: "classic", stable, amountOut }
    }
  } catch {
    // Ignore and fall through.
  }

  return null
}
