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

export const LOTTERY_ABI = [
  {
    type: "function",
    name: "currentRoundId",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "getRound",
    stateMutability: "view",
    inputs: [{ name: "roundId", type: "uint256" }],
    outputs: [
      {
        name: "",
        type: "tuple",
        components: [
          { name: "startAt", type: "uint256" },
          { name: "endAt", type: "uint256" },
          { name: "ticketPriceBanda", type: "uint256" },
          { name: "ticketPriceUsdc", type: "uint256" },
          { name: "potUsdcInitial", type: "uint256" },
          { name: "potUsdcFromTickets", type: "uint256" },
          { name: "potUsdcTotal", type: "uint256" },
          { name: "totalTickets", type: "uint256" },
          { name: "winner", type: "address" },
          { name: "requestId", type: "uint256" },
          { name: "settled", type: "bool" },
        ],
      },
    ],
  },
  {
    type: "function",
    name: "getTickets",
    stateMutability: "view",
    inputs: [
      { name: "roundId", type: "uint256" },
      { name: "user", type: "address" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "isClaimed",
    stateMutability: "view",
    inputs: [
      { name: "roundId", type: "uint256" },
      { name: "user", type: "address" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    type: "function",
    name: "buyWithBanda",
    stateMutability: "nonpayable",
    inputs: [
      { name: "count", type: "uint256" },
      { name: "pricePerTicketBanda", type: "uint256" },
      { name: "usdcValuePerTicket", type: "uint256" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "buyWithUsdc",
    stateMutability: "nonpayable",
    inputs: [
      { name: "count", type: "uint256" },
      { name: "pricePerTicketUsdc", type: "uint256" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "claimWinnings",
    stateMutability: "nonpayable",
    inputs: [{ name: "roundId", type: "uint256" }],
    outputs: [],
  },
] as const

export const PLINKO_ABI = [
  {
    type: "function",
    name: "play",
    stateMutability: "nonpayable",
    inputs: [
      { name: "risk", type: "uint8" },
      { name: "stake", type: "uint256" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "claim",
    stateMutability: "nonpayable",
    inputs: [],
    outputs: [],
  },
  {
    type: "function",
    name: "discard",
    stateMutability: "nonpayable",
    inputs: [],
    outputs: [],
  },
  {
    type: "function",
    name: "pendingOf",
    stateMutability: "view",
    inputs: [{ name: "player", type: "address" }],
    outputs: [
      { name: "active", type: "bool" },
      { name: "risk", type: "uint8" },
      { name: "slot", type: "uint8" },
      { name: "multiplierBps", type: "uint32" },
      { name: "stake", type: "uint256" },
      { name: "payout", type: "uint256" },
      { name: "playedAt", type: "uint256" },
      { name: "nonce", type: "uint256" },
    ],
  },
  {
    type: "function",
    name: "getMultipliers",
    stateMutability: "view",
    inputs: [{ name: "risk", type: "uint8" }],
    outputs: [{ name: "", type: "uint32[9]" }],
  },
] as const
