import { NextResponse } from "next/server"

export const runtime = "nodejs"

const isHexAddress = (value: string) => /^0x[a-fA-F0-9]{40}$/.test(value)

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { address?: string }
    if (!body?.address || !isHexAddress(body.address)) {
      return NextResponse.json({ error: "Invalid address." }, { status: 400 })
    }

    const apiKey = process.env.NEYNAR_API_KEY
    if (!apiKey) {
      return NextResponse.json({ error: "Missing NEYNAR_API_KEY." }, { status: 500 })
    }

    const url = new URL("https://api.neynar.com/v2/farcaster/user/bulk-by-address")
    url.searchParams.set("addresses", body.address)
    url.searchParams.set("address_types", "custody_address,verified_address")

    const response = await fetch(url.toString(), {
      headers: {
        "x-api-key": apiKey,
        accept: "application/json",
      },
    })

    const data = (await response.json()) as {
      users?: Array<{
        username?: string
        display_name?: string
        pfp_url?: string
      }>
    }

    if (!response.ok) {
      const message = (data as { message?: string }).message ?? "Failed to fetch Farcaster profile."
      return NextResponse.json({ error: message }, { status: response.status })
    }

    const user = data?.users?.[0]

    return NextResponse.json({
      username: user?.username ?? null,
      displayName: user?.display_name ?? null,
      pfpUrl: user?.pfp_url ?? null,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch Farcaster profile."
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
