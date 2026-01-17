export type PfpItem = {
  id: number
  src: string
  rarity: "Regular" | "Epic" | "Legendary"
  priceUsdc: number
  priceRaw: bigint
}

export const USDC_DECIMALS = 6

const USDC_FACTOR = 10n ** 6n

const toRaw = (priceUsdc: number) => BigInt(priceUsdc) * USDC_FACTOR

export const PFP_ITEMS: readonly PfpItem[] = [
  { id: 1, src: "/PPnft1.png", rarity: "Regular", priceUsdc: 5, priceRaw: toRaw(5) },
  { id: 2, src: "/PPnft2.png", rarity: "Regular", priceUsdc: 5, priceRaw: toRaw(5) },
  { id: 3, src: "/PPnft3.png", rarity: "Epic", priceUsdc: 10, priceRaw: toRaw(10) },
  { id: 4, src: "/PPnft4.png", rarity: "Epic", priceUsdc: 10, priceRaw: toRaw(10) },
  { id: 5, src: "/PPnft5.png", rarity: "Legendary", priceUsdc: 15, priceRaw: toRaw(15) },
  { id: 6, src: "/PPnft6.png", rarity: "Legendary", priceUsdc: 15, priceRaw: toRaw(15) },
] as const

export const PFP_TOKEN_IDS = PFP_ITEMS.map((item) => item.id) as readonly number[]
