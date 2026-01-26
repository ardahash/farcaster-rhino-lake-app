export type PickaxeTier = "starter" | "bronze" | "iron" | "polished" | "mystic" | "legendary"

export const PICKAXE_TIERS = [
  {
    id: "starter",
    tokenId: 0,
    label: "Starter Pickaxe",
    costUsdc: 0,
    rewardPerClick: 1,
    image: null,
  },
  {
    id: "bronze",
    tokenId: 1,
    label: "Bronze Pickaxe",
    costUsdc: 5,
    rewardPerClick: 2,
    image: "/bronzepickaxe.png",
  },
  {
    id: "iron",
    tokenId: 2,
    label: "Iron Pickaxe",
    costUsdc: 10,
    rewardPerClick: 4,
    image: "/ironpickaxe.png",
  },
  {
    id: "polished",
    tokenId: 3,
    label: "Polished Pickaxe",
    costUsdc: 15,
    rewardPerClick: 6,
    image: "/polishedpickaxe.png",
  },
  {
    id: "mystic",
    tokenId: 4,
    label: "Mystic Pickaxe",
    costUsdc: 20,
    rewardPerClick: 10,
    image: "/mysticpickaxe.png",
  },
  {
    id: "legendary",
    tokenId: 5,
    label: "Legendary Pickaxe",
    costUsdc: 50,
    rewardPerClick: 25,
    image: "/legendarypickaxe.png",
  },
] as const

export const PICKAXE_TIER_ORDER = PICKAXE_TIERS.map((tier) => tier.id)

export const getPickaxeTier = (tierId?: string | null) =>
  PICKAXE_TIERS.find((tier) => tier.id === tierId) ?? PICKAXE_TIERS[0]

export const getPickaxeTierByTokenId = (tokenId: number) =>
  PICKAXE_TIERS.find((tier) => tier.tokenId === tokenId)

export const getTierIndex = (tierId: PickaxeTier) => PICKAXE_TIER_ORDER.indexOf(tierId)
