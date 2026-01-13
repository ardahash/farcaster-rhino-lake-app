"use client"

import type { Address, PublicClient } from "viem"
import {
  AERODROME_CLASSIC_FACTORY_ADDRESS,
  AERODROME_CLASSIC_ROUTER_ABI,
  AERODROME_CLASSIC_ROUTER_ADDRESS,
  AERODROME_SLIPSTREAM_QUOTER_ABI,
  AERODROME_SLIPSTREAM_QUOTER_ADDRESS,
  SLIPSTREAM_FEE_TIERS,
  USDC_ADDRESS,
  WETH_ADDRESS,
} from "@/lib/aerodrome"

export type ClassicRoute = {
  from: Address
  to: Address
  stable: boolean
  factory: Address
}

export type SwapRouteChoice =
  | { mode: "slipstream"; fee: number; amountOut: bigint }
  | { mode: "classic"; routes: ClassicRoute[]; amountOut: bigint }

export const buildClassicRoute = (tokenIn: Address, tokenOut: Address, stable: boolean) => [
  {
    from: tokenIn,
    to: tokenOut,
    stable,
    factory: AERODROME_CLASSIC_FACTORY_ADDRESS,
  },
]

const buildClassicRoutes = (tokens: Address[], stableFlags: boolean[]): ClassicRoute[] =>
  tokens.slice(0, -1).map((token, index) => ({
    from: token,
    to: tokens[index + 1] as Address,
    stable: stableFlags[index] ?? false,
    factory: AERODROME_CLASSIC_FACTORY_ADDRESS,
  }))

const getClassicCandidates = (tokenIn: Address, tokenOut: Address): ClassicRoute[][] => {
  const candidates: ClassicRoute[][] = [
    buildClassicRoutes([tokenIn, tokenOut], [false]),
    buildClassicRoutes([tokenIn, tokenOut], [true]),
  ]

  const intermediates = [WETH_ADDRESS, USDC_ADDRESS].filter(
    (token) => token !== tokenIn && token !== tokenOut,
  )

  for (const middle of intermediates) {
    candidates.push(buildClassicRoutes([tokenIn, middle, tokenOut], [false, false]))
  }

  return candidates
}

export const selectBestRoute = async ({
  publicClient,
  amountIn,
  tokenIn,
  tokenOut,
}: {
  publicClient: PublicClient
  amountIn: bigint
  tokenIn: Address
  tokenOut: Address
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

  let bestClassic: { routes: ClassicRoute[]; amountOut: bigint } | null = null
  const classicCandidates = getClassicCandidates(tokenIn, tokenOut)
  for (const routes of classicCandidates) {
    try {
      const amounts = (await publicClient.readContract({
        address: AERODROME_CLASSIC_ROUTER_ADDRESS,
        abi: AERODROME_CLASSIC_ROUTER_ABI,
        functionName: "getAmountsOut",
        args: [amountIn, routes],
      })) as bigint[]

      const amountOut = amounts[amounts.length - 1] ?? 0n
      if (amountOut > 0n && (!bestClassic || amountOut > bestClassic.amountOut)) {
        bestClassic = { routes, amountOut }
      }
    } catch {
      // Ignore failing routes and continue.
    }
  }

  if (bestClassic) {
    return { mode: "classic", ...bestClassic }
  }

  return null
}
