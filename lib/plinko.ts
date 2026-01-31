export const PLINKO_SLOTS = 9
export const PLINKO_STAKES = [1, 5, 10] as const

export const PLINKO_RISKS = [
  { id: "low", label: "Low", rtp: "about 98%" },
  { id: "medium", label: "Medium", rtp: "about 96-97%" },
  { id: "high", label: "High", rtp: "about 96%" },
] as const

export type PlinkoRisk = (typeof PLINKO_RISKS)[number]["id"]

export const PLINKO_MULTIPLIERS_BPS: Record<PlinkoRisk, number[]> = {
  low: [5000, 7000, 9000, 10000, 12000, 10000, 9000, 7000, 5000],
  medium: [0, 5000, 8000, 12000, 20000, 12000, 8000, 5000, 0],
  high: [0, 2000, 5000, 10000, 100000, 10000, 5000, 2000, 0],
}

export const getMultiplierLabel = (bps: number) => `${(bps / 10000).toFixed(bps % 10000 === 0 ? 0 : 2)}x`
