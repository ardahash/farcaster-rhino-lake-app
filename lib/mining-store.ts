export const MAX_MINING_CLICKS = 10000

const miningCounts = new Map<string, number>()

export const getMiningCount = (address: string) => miningCounts.get(address) ?? 0

export const incrementMiningCount = (address: string) => {
  const current = miningCounts.get(address) ?? 0
  const next = Math.min(current + 1, MAX_MINING_CLICKS)
  miningCounts.set(address, next)
  return next
}

export const resetMiningCount = (address: string) => {
  miningCounts.delete(address)
}

export const setMiningCount = (address: string, count: number) => {
  const next = Math.max(0, Math.min(count, MAX_MINING_CLICKS))
  miningCounts.set(address, next)
  return next
}
