"use client"

import type { Address } from "viem"
import { base } from "wagmi/chains"

export const BASE_MAINNET_CHAIN_ID = base.id

export const ZEN_BURN_MANAGER_ADDRESS =
  (process.env.NEXT_PUBLIC_ZEN_BURN_MANAGER_ADDRESS as Address | undefined) ??
  ("0x89e273c05d6DdB3d54a8bd669FA4E2B2A857B90c" as const)

export const ZEN_BURN_MANAGER_ABI = [
  {
    type: "function",
    name: "burnZen",
    stateMutability: "nonpayable",
    inputs: [{ name: "amount", type: "uint256" }],
    outputs: [],
  },
  {
    type: "function",
    name: "zen",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
  },
  {
    type: "function",
    name: "zenDecimals",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint8" }],
  },
] as const

export const ZEN_BURNED_EVENT = {
  type: "event",
  name: "ZenBurned",
  inputs: [
    { name: "user", type: "address", indexed: true },
    { name: "burnAmount", type: "uint256", indexed: false },
    { name: "feeAmount", type: "uint256", indexed: false },
    { name: "newTotalBurned", type: "uint256", indexed: false },
  ],
} as const

export const ERC20_ABI = [
  {
    type: "function",
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    type: "function",
    name: "allowance",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "decimals",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint8" }],
  },
] as const
