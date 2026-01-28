"use client"

import { BASE_MAINNET_CHAIN_ID } from "@/lib/base-config"
import { CONTRACT_ADDRESSES } from "@/lib/contract-addresses"

export const CHAIN_ID = BASE_MAINNET_CHAIN_ID
export const CONTRACTS = CONTRACT_ADDRESSES

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
    name: "transfer",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    type: "function",
    name: "decimals",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint8" }],
  },
] as const

export const CITY_NFT_ABI = [
  {
    type: "function",
    name: "cityOf",
    stateMutability: "view",
    inputs: [{ name: "owner", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "ownerOf",
    stateMutability: "view",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [{ name: "", type: "address" }],
  },
  {
    type: "event",
    name: "Transfer",
    inputs: [
      { name: "from", type: "address", indexed: true },
      { name: "to", type: "address", indexed: true },
      { name: "tokenId", type: "uint256", indexed: true },
    ],
  },
] as const

export const GAME_ABI = [
  {
    type: "function",
    name: "createCity",
    stateMutability: "nonpayable",
    inputs: [],
    outputs: [{ name: "cityId", type: "uint256" }],
  },
  {
    type: "function",
    name: "cities",
    stateMutability: "view",
    inputs: [{ name: "cityId", type: "uint256" }],
    outputs: [
      { name: "barLocked", type: "uint256" },
      { name: "rhinoLocked", type: "uint256" },
      { name: "hits", type: "uint8" },
      { name: "dead", type: "bool" },
      { name: "lastAttackAt", type: "uint64" },
    ],
  },
  {
    type: "function",
    name: "levelOf",
    stateMutability: "view",
    inputs: [{ name: "cityId", type: "uint256" }],
    outputs: [{ name: "", type: "uint8" }],
  },
  {
    type: "function",
    name: "lockBAR",
    stateMutability: "nonpayable",
    inputs: [
      { name: "cityId", type: "uint256" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "lockRHINO",
    stateMutability: "nonpayable",
    inputs: [
      { name: "cityId", type: "uint256" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "attack",
    stateMutability: "nonpayable",
    inputs: [
      { name: "attackerCityId", type: "uint256" },
      { name: "defenderCityId", type: "uint256" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "ethClaimable",
    stateMutability: "view",
    inputs: [{ name: "cityId", type: "uint256" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "claimEth",
    stateMutability: "nonpayable",
    inputs: [{ name: "cityId", type: "uint256" }],
    outputs: [],
  },
  {
    type: "function",
    name: "attackCooldown",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "attackCostRhino",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "event",
    name: "CityCreated",
    inputs: [
      { name: "owner", type: "address", indexed: true },
      { name: "cityId", type: "uint256", indexed: true },
    ],
  },
] as const

export const BURNER_ABI = [
  {
    type: "function",
    name: "burnZen",
    stateMutability: "nonpayable",
    inputs: [{ name: "zenAmount", type: "uint256" }],
    outputs: [],
  },
  {
    type: "function",
    name: "currentRate",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "totalMinted",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "maxMint",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "event",
    name: "Burned",
    inputs: [
      { name: "user", type: "address", indexed: true },
      { name: "zenAmount", type: "uint256", indexed: false },
      { name: "rhinoMinted", type: "uint256", indexed: false },
    ],
  },
] as const

export const PROFILE_PIC_NFT_ABI = [
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [
      { name: "account", type: "address" },
      { name: "id", type: "uint256" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "balanceOfBatch",
    stateMutability: "view",
    inputs: [
      { name: "accounts", type: "address[]" },
      { name: "ids", type: "uint256[]" },
    ],
    outputs: [{ name: "", type: "uint256[]" }],
  },
  {
    type: "function",
    name: "buy",
    stateMutability: "nonpayable",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [],
  },
  {
    type: "function",
    name: "setActive",
    stateMutability: "nonpayable",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [],
  },
  {
    type: "function",
    name: "activeOf",
    stateMutability: "view",
    inputs: [{ name: "user", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const

export const BANDA_NFT_ABI = [
  {
    type: "function",
    name: "buy",
    stateMutability: "nonpayable",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [],
  },
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [
      { name: "account", type: "address" },
      { name: "id", type: "uint256" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const

export const PICKAXE_NFT_ABI = [
  {
    type: "function",
    name: "buy",
    stateMutability: "nonpayable",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [],
  },
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [
      { name: "account", type: "address" },
      { name: "id", type: "uint256" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const
