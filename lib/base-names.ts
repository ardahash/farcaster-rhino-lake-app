"use client"

import type { Address, PublicClient } from "viem"
import { createPublicClient, http, zeroAddress } from "viem"
import { namehash } from "viem/ens"
import { base } from "viem/chains"
import { BASE_NAME_L2_RESOLVER_ADDRESS, BASE_NAME_REGISTRY_ADDRESS, getRpcUrlForChain } from "@/lib/base-config"
import { BASE_MAINNET_CHAIN_ID } from "@/lib/zen-burn"

const REGISTRY_ABI = [
  {
    type: "function",
    name: "resolver",
    stateMutability: "view",
    inputs: [{ name: "node", type: "bytes32" }],
    outputs: [{ name: "resolver", type: "address" }],
  },
] as const

const RESOLVER_ABI = [
  {
    type: "function",
    name: "name",
    stateMutability: "view",
    inputs: [{ name: "node", type: "bytes32" }],
    outputs: [{ name: "name", type: "string" }],
  },
] as const

const createBasePublicClient = () => {
  const rpcUrl = getRpcUrlForChain(BASE_MAINNET_CHAIN_ID)
  return createPublicClient({
    chain: base,
    transport: rpcUrl ? http(rpcUrl) : http(),
  })
}

export const resolveBaseName = async ({
  address,
  publicClient,
}: {
  address: Address
  publicClient?: PublicClient
}) => {
  const client = publicClient ?? createBasePublicClient()
  const reverseName = `${address.slice(2).toLowerCase()}.addr.reverse`
  const node = namehash(reverseName)

  let resolver: Address | null = null
  try {
    resolver = (await client.readContract({
      address: BASE_NAME_REGISTRY_ADDRESS,
      abi: REGISTRY_ABI,
      functionName: "resolver",
      args: [node],
    })) as Address
  } catch {
    resolver = null
  }

  if (!resolver || resolver === zeroAddress) {
    resolver = BASE_NAME_L2_RESOLVER_ADDRESS ?? null
  }

  if (!resolver || resolver === zeroAddress) {
    return null
  }

  try {
    const name = (await client.readContract({
      address: resolver,
      abi: RESOLVER_ABI,
      functionName: "name",
      args: [node],
    })) as string
    return name || null
  } catch {
    return null
  }
}
