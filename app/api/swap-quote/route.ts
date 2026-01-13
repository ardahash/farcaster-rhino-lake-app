import { NextResponse } from "next/server"
import { CdpClient } from "@coinbase/cdp-sdk"

export const runtime = "nodejs"

type SwapQuoteRequest = {
  fromToken: `0x${string}`
  toToken: `0x${string}`
  fromAmount: string
  taker: `0x${string}`
  slippageBps?: number
}

const getCdpClient = () => {
  const apiKeyId = process.env.CDP_API_KEY_ID
  const apiKeySecret = process.env.CDP_API_KEY_SECRET
  const walletSecret = process.env.CDP_WALLET_SECRET

  if (!apiKeyId || !apiKeySecret) {
    throw new Error("Missing CDP API credentials.")
  }

  return new CdpClient({
    apiKeyId,
    apiKeySecret,
    walletSecret,
  })
}

const isHexAddress = (value: string) => /^0x[a-fA-F0-9]{40}$/.test(value)

const serializeBigInt = (value: unknown): unknown => {
  if (typeof value === "bigint") {
    return value.toString()
  }
  if (Array.isArray(value)) {
    return value.map((entry) => serializeBigInt(entry))
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, serializeBigInt(entry)]),
    )
  }
  return value
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as SwapQuoteRequest
    if (!body || !isHexAddress(body.fromToken) || !isHexAddress(body.toToken) || !isHexAddress(body.taker)) {
      return NextResponse.json({ error: "Invalid swap quote request." }, { status: 400 })
    }

    if (!body.fromAmount || !/^\d+$/.test(body.fromAmount)) {
      return NextResponse.json({ error: "fromAmount must be a base-10 integer string." }, { status: 400 })
    }

    const cdp = getCdpClient()
    const quote = await cdp.evm.createSwapQuote({
      network: "base",
      fromToken: body.fromToken,
      toToken: body.toToken,
      fromAmount: BigInt(body.fromAmount),
      taker: body.taker,
      slippageBps: body.slippageBps,
    })

    if (!quote.liquidityAvailable) {
      return NextResponse.json({ liquidityAvailable: false })
    }

    const response = {
      liquidityAvailable: true,
      network: quote.network,
      toToken: quote.toToken,
      fromToken: quote.fromToken,
      fromAmount: quote.fromAmount,
      toAmount: quote.toAmount,
      minToAmount: quote.minToAmount,
      blockNumber: quote.blockNumber,
      fees: quote.fees,
      issues: quote.issues,
      transaction: quote.transaction,
      permit2: quote.permit2,
    }

    return NextResponse.json(serializeBigInt(response))
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create swap quote."
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
