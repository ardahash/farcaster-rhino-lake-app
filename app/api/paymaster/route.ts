import { NextResponse } from "next/server"

const PAYMASTER_URLS: Record<string, string | undefined> = {
  "8453": process.env.BASE_PAYMASTER_URL,
  "84532": process.env.BASE_SEPOLIA_PAYMASTER_URL,
}

const AUTH_HEADER = process.env.PAYMASTER_AUTH_HEADER
const AUTH_VALUE = process.env.PAYMASTER_AUTH_VALUE

export async function POST(request: Request) {
  const { searchParams } = new URL(request.url)
  const chainId = searchParams.get("chainId") ?? ""
  const paymasterUrl = PAYMASTER_URLS[chainId]

  if (!paymasterUrl) {
    return NextResponse.json(
      { error: "Paymaster URL is not configured for this network." },
      { status: 400 },
    )
  }

  const body = await request.text()

  const response = await fetch(paymasterUrl, {
    method: "POST",
    headers: {
      "content-type": request.headers.get("content-type") ?? "application/json",
      ...(AUTH_HEADER && AUTH_VALUE ? { [AUTH_HEADER]: AUTH_VALUE } : {}),
    },
    body,
  })

  const responseBody = await response.text()

  return new NextResponse(responseBody, {
    status: response.status,
    headers: {
      "content-type": response.headers.get("content-type") ?? "application/json",
    },
  })
}
