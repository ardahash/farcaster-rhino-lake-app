export const MAX_MINING_CLICKS = 10000
export const MAX_CLICKS_PER_SECOND = 12
export const MIN_CLAIM_INTERVAL_MS = 15000

const miningCounts = new Map<string, number>()
const miningClickWindows = new Map<string, { start: number; count: number }>()
const miningLastClaim = new Map<string, number>()

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

export const canIncrementMining = (address: string, now = Date.now()) => {
  const window = miningClickWindows.get(address)
  if (!window || now - window.start >= 1000) {
    miningClickWindows.set(address, { start: now, count: 1 })
    return true
  }
  if (window.count >= MAX_CLICKS_PER_SECOND) {
    return false
  }
  window.count += 1
  miningClickWindows.set(address, window)
  return true
}

export const canClaimMining = (address: string, now = Date.now()) => {
  const last = miningLastClaim.get(address)
  if (last && now - last < MIN_CLAIM_INTERVAL_MS) {
    return false
  }
  miningLastClaim.set(address, now)
  return true
}
