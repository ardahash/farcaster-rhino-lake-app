"use client"

import type { Address } from "viem"

export const BASE_CHAIN_ID = 8453

export const WETH_ADDRESS =
  (process.env.NEXT_PUBLIC_WETH_ADDRESS as Address | undefined) ??
  ("0x4200000000000000000000000000000000000006" as Address)

export const USDC_ADDRESS =
  (process.env.NEXT_PUBLIC_USDC_ADDRESS as Address | undefined) ??
  ("0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as Address)

export const ZEN_TOKEN_ADDRESS =
  (process.env.NEXT_PUBLIC_ZEN_TOKEN_ADDRESS as Address | undefined) ??
  ("0xf43eB8De897Fbc7F2502483B2Bef7Bb9EA179229" as Address)

export const AERODROME_CLASSIC_ROUTER_ADDRESS =
  (process.env.NEXT_PUBLIC_AERODROME_CLASSIC_ROUTER_ADDRESS as Address | undefined) ??
  ("0xcF77a3Ba9A5CA399B7c97c74d54e5b1Beb874E43" as Address)

export const AERODROME_CLASSIC_FACTORY_ADDRESS =
  (process.env.NEXT_PUBLIC_AERODROME_CLASSIC_FACTORY_ADDRESS as Address | undefined) ??
  ("0x420dD381b31aEf6683db6B902084cB0FFECe40Da" as Address)

export const AERODROME_SLIPSTREAM_ROUTER_ADDRESS =
  (process.env.NEXT_PUBLIC_AERODROME_SLIPSTREAM_ROUTER_ADDRESS as Address | undefined) ??
  ("0xBe6D8F0D05cC4be24d5167a3eF062215bE6D18a5" as Address)

export const AERODROME_SLIPSTREAM_QUOTER_ADDRESS =
  (process.env.NEXT_PUBLIC_AERODROME_SLIPSTREAM_QUOTER_ADDRESS as Address | undefined) ?? undefined

export const SLIPSTREAM_FEE_TIERS = [100, 500, 3000, 10000] as const

export const AERODROME_CLASSIC_ROUTER_ABI = [
  {
    type: "function",
    name: "getAmountsOut",
    stateMutability: "view",
    inputs: [
      { name: "amountIn", type: "uint256" },
      {
        name: "routes",
        type: "tuple[]",
        components: [
          { name: "from", type: "address" },
          { name: "to", type: "address" },
          { name: "stable", type: "bool" },
          { name: "factory", type: "address" },
        ],
      },
    ],
    outputs: [{ name: "amounts", type: "uint256[]" }],
  },
  {
    type: "function",
    name: "swapExactTokensForTokens",
    stateMutability: "nonpayable",
    inputs: [
      { name: "amountIn", type: "uint256" },
      { name: "amountOutMin", type: "uint256" },
      {
        name: "routes",
        type: "tuple[]",
        components: [
          { name: "from", type: "address" },
          { name: "to", type: "address" },
          { name: "stable", type: "bool" },
          { name: "factory", type: "address" },
        ],
      },
      { name: "to", type: "address" },
      { name: "deadline", type: "uint256" },
    ],
    outputs: [{ name: "amounts", type: "uint256[]" }],
  },
  {
    type: "function",
    name: "swapExactETHForTokens",
    stateMutability: "payable",
    inputs: [
      { name: "amountOutMin", type: "uint256" },
      {
        name: "routes",
        type: "tuple[]",
        components: [
          { name: "from", type: "address" },
          { name: "to", type: "address" },
          { name: "stable", type: "bool" },
          { name: "factory", type: "address" },
        ],
      },
      { name: "to", type: "address" },
      { name: "deadline", type: "uint256" },
    ],
    outputs: [{ name: "amounts", type: "uint256[]" }],
  },
] as const

export const AERODROME_SLIPSTREAM_ROUTER_ABI = [
  {
    type: "function",
    name: "exactInputSingle",
    stateMutability: "payable",
    inputs: [
      {
        name: "params",
        type: "tuple",
        components: [
          { name: "tokenIn", type: "address" },
          { name: "tokenOut", type: "address" },
          { name: "fee", type: "uint24" },
          { name: "recipient", type: "address" },
          { name: "deadline", type: "uint256" },
          { name: "amountIn", type: "uint256" },
          { name: "amountOutMinimum", type: "uint256" },
          { name: "sqrtPriceLimitX96", type: "uint160" },
        ],
      },
    ],
    outputs: [{ name: "amountOut", type: "uint256" }],
  },
] as const

export const AERODROME_SLIPSTREAM_QUOTER_ABI = [
  {
    type: "function",
    name: "quoteExactInputSingle",
    stateMutability: "view",
    inputs: [
      { name: "tokenIn", type: "address" },
      { name: "tokenOut", type: "address" },
      { name: "fee", type: "uint24" },
      { name: "amountIn", type: "uint256" },
      { name: "sqrtPriceLimitX96", type: "uint160" },
    ],
    outputs: [{ name: "amountOut", type: "uint256" }],
  },
] as const
