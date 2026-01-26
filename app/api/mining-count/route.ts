import { NextResponse } from "next/server"
import { getMiningCount } from "@/lib/mining-store"

export const runtime = "nodejs"

const isHexAddress = (value: string) => /^0x[a-fA-F0-9]{40}$/.test(value)

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { address?: string }
    if (!body?.address || !isHexAddress(body.address)) {
      return NextResponse.json({ error: "Invalid address." }, { status: 400 })
    }

    const normalized = body.address.toLowerCase()
    const count = getMiningCount(normalized)
    return NextResponse.json({ count })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load mining data."
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
