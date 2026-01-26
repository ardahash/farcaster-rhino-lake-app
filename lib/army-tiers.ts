export type BandaTier = "starter" | "bronze" | "iron" | "gold" | "platinum" | "alien"

export const BANDA_TIERS = [
  {
    id: "starter",
    tokenId: 0,
    label: "Starter Crest",
    costUsdc: 0,
    ratePerSecond: 1,
    image: null,
  },
  {
    id: "bronze",
    tokenId: 1,
    label: "Bronze BANDA",
    costUsdc: 5,
    ratePerSecond: 2,
    image: "/bronzebanda.png",
  },
  {
    id: "iron",
    tokenId: 2,
    label: "Iron BANDA",
    costUsdc: 10,
    ratePerSecond: 5,
    image: "/ironbanda.png",
  },
  {
    id: "gold",
    tokenId: 3,
    label: "Gold BANDA",
    costUsdc: 20,
    ratePerSecond: 20,
    image: "/goldbanda.png",
  },
  {
    id: "platinum",
    tokenId: 4,
    label: "Platinum BANDA",
    costUsdc: 50,
    ratePerSecond: 60,
    image: "/platinumbanda.png",
  },
  {
    id: "alien",
    tokenId: 5,
    label: "Alien Panda",
    costUsdc: 100,
    ratePerSecond: 150,
    image: "/alienpanda.png",
  },
] as const

export const BANDA_TIER_ORDER = BANDA_TIERS.map((tier) => tier.id)

export const getBandaTier = (tierId?: string | null) =>
  BANDA_TIERS.find((tier) => tier.id === tierId) ?? BANDA_TIERS[0]

export const getBandaTierByTokenId = (tokenId: number) => BANDA_TIERS.find((tier) => tier.tokenId === tokenId)

export const getBandaTierIndex = (tierId: BandaTier) => BANDA_TIER_ORDER.indexOf(tierId)
