"use client"

import type { Address, PublicClient } from "viem"
import {
  AERODROME_CLASSIC_FACTORY_ADDRESS,
  AERODROME_CLASSIC_ROUTER_ABI,
  AERODROME_CLASSIC_ROUTER_ADDRESS,
  AERODROME_SLIPSTREAM_QUOTER_ABI,
  AERODROME_SLIPSTREAM_QUOTER_ADDRESS,
  AERODROME_SLIPSTREAM_ROUTER_ADDRESS,
  AERODROME_SLIPSTREAM_ZEN_USDC_POOL_ADDRESS,
  AERODROME_SLIPSTREAM_ZEN_WETH_POOL_ADDRESS,
  SLIPSTREAM_FEE_TIERS,
  UNISWAP_V3_QUOTER_ABI,
  UNISWAP_V3_QUOTER_ADDRESS,
  UNISWAP_V3_ROUTER_ADDRESS,
  UNISWAP_V3_ZEN_USDC_POOL_ADDRESS,
  UNISWAP_V3_ZEN_WETH_POOL_ADDRESS,
  USDC_ADDRESS,
  V3_POOL_ABI,
  WETH_ADDRESS,
  ZEN_TOKEN_ADDRESS,
} from "@/lib/aerodrome"

export type ClassicRoute = {
  from: Address
  to: Address
  stable: boolean
  factory: Address
}

export type SwapRouteChoice =
  | {
      mode: "slipstream"
      fee: number
      amountOut: bigint
      router: Address
      pool?: Address
    }
  | {
      mode: "uniswap"
      fee: number
      amountOut: bigint
      router: Address
      pool?: Address
    }
  | {
      mode: "classic"
      routes: ClassicRoute[]
      amountOut: bigint
      router: Address
    }

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

const getPoolForPair = (
  tokenIn: Address,
  tokenOut: Address,
  poolAddress: Address,
  tokenA: Address,
  tokenB: Address,
) => {
  const matches =
    (tokenIn === tokenA && tokenOut === tokenB) || (tokenIn === tokenB && tokenOut === tokenA)
  return matches ? poolAddress : undefined
}

const getSlipstreamPool = (tokenIn: Address, tokenOut: Address) =>
  getPoolForPair(
    tokenIn,
    tokenOut,
    tokenIn === USDC_ADDRESS || tokenOut === USDC_ADDRESS
      ? AERODROME_SLIPSTREAM_ZEN_USDC_POOL_ADDRESS
      : AERODROME_SLIPSTREAM_ZEN_WETH_POOL_ADDRESS,
    ZEN_TOKEN_ADDRESS,
    tokenIn === USDC_ADDRESS || tokenOut === USDC_ADDRESS ? USDC_ADDRESS : WETH_ADDRESS,
  )

const getUniswapPool = (tokenIn: Address, tokenOut: Address) =>
  getPoolForPair(
    tokenIn,
    tokenOut,
    tokenIn === USDC_ADDRESS || tokenOut === USDC_ADDRESS
      ? UNISWAP_V3_ZEN_USDC_POOL_ADDRESS
      : UNISWAP_V3_ZEN_WETH_POOL_ADDRESS,
    ZEN_TOKEN_ADDRESS,
    tokenIn === USDC_ADDRESS || tokenOut === USDC_ADDRESS ? USDC_ADDRESS : WETH_ADDRESS,
  )

const readPoolFee = async (publicClient: PublicClient, pool?: Address) => {
  if (!pool) return null
  try {
    const fee = (await publicClient.readContract({
      address: pool,
      abi: V3_POOL_ABI,
      functionName: "fee",
    })) as number | bigint
    return Number(fee)
  } catch {
    return null
  }
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
    const pool = getSlipstreamPool(tokenIn, tokenOut)
    const poolFee = await readPoolFee(publicClient, pool)
    const slipstreamFees = poolFee ? [poolFee] : SLIPSTREAM_FEE_TIERS
    let bestQuote: { fee: number; amountOut: bigint } | null = null
    for (const fee of slipstreamFees) {
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
      return {
        mode: "slipstream",
        router: AERODROME_SLIPSTREAM_ROUTER_ADDRESS as Address,
        pool,
        ...bestQuote,
      }
    }
  }

  if (UNISWAP_V3_QUOTER_ADDRESS) {
    const pool = getUniswapPool(tokenIn, tokenOut)
    const poolFee = await readPoolFee(publicClient, pool)
    const uniswapFees = poolFee ? [poolFee] : SLIPSTREAM_FEE_TIERS
    let bestQuote: { fee: number; amountOut: bigint } | null = null
    for (const fee of uniswapFees) {
      try {
        const quoteResult = (await publicClient.readContract({
          address: UNISWAP_V3_QUOTER_ADDRESS,
          abi: UNISWAP_V3_QUOTER_ABI,
          functionName: "quoteExactInputSingle",
          args: [
            {
              tokenIn,
              tokenOut,
              amountIn,
              fee,
              sqrtPriceLimitX96: 0n,
            },
          ],
        })) as readonly [bigint, bigint, number, bigint]

        const amountOut = quoteResult[0] ?? 0n
        if (amountOut > 0n && (!bestQuote || amountOut > bestQuote.amountOut)) {
          bestQuote = { fee, amountOut }
        }
      } catch {
        // Ignore failing fee tiers.
      }
    }

    if (bestQuote) {
      return {
        mode: "uniswap",
        router: UNISWAP_V3_ROUTER_ADDRESS as Address,
        pool,
        ...bestQuote,
      }
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
    return {
      mode: "classic",
      router: AERODROME_CLASSIC_ROUTER_ADDRESS,
      ...bestClassic,
    }
  }

  return null
}
