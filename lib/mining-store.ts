export const MAX_MINING_CLICKS = 10000
export const MAX_CLICKS_PER_SECOND = 12
export const MAX_CLICKS_PER_REQUEST = 25
export const MIN_CLAIM_INTERVAL_MS = 15000

const miningCounts = new Map<string, number>()
const miningClickWindows = new Map<string, { start: number; count: number }>()
const miningLastClaim = new Map<string, number>()
const pendingMiningClaims = new Map<
  string,
  {
    clicks: number
    amountRaw: bigint
    amount: string
    nonce: bigint
    deadline: number
    signature: `0x${string}`
  }
>()

export const getMiningCount = (address: string) => miningCounts.get(address) ?? 0

export const incrementMiningCount = (address: string) => {
  const current = miningCounts.get(address) ?? 0
  const next = Math.min(current + 1, MAX_MINING_CLICKS)
  miningCounts.set(address, next)
  return next
}

export const incrementMiningCountBy = (address: string, count: number) => {
  const current = miningCounts.get(address) ?? 0
  const safeCount = Math.max(0, count)
  const next = Math.min(current + safeCount, MAX_MINING_CLICKS)
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

export const consumeMiningClicks = (address: string, requested: number, now = Date.now()) => {
  const safeRequested = Math.max(0, Math.min(requested, MAX_CLICKS_PER_REQUEST))
  let accepted = 0
  for (let i = 0; i < safeRequested; i += 1) {
    if (!canIncrementMining(address, now)) {
      break
    }
    incrementMiningCount(address)
    accepted += 1
  }
  return {
    accepted,
    count: getMiningCount(address),
  }
}

export const canClaimMining = (address: string, now = Date.now()) => {
  const last = miningLastClaim.get(address)
  if (last && now - last < MIN_CLAIM_INTERVAL_MS) {
    return false
  }
  miningLastClaim.set(address, now)
  return true
}

export const getPendingMiningClaim = (address: string) => pendingMiningClaims.get(address)

export const setPendingMiningClaim = (
  address: string,
  claim: {
    clicks: number
    amountRaw: bigint
    amount: string
    nonce: bigint
    deadline: number
    signature: `0x${string}`
  },
) => {
  pendingMiningClaims.set(address, claim)
  return claim
}

export const clearPendingMiningClaim = (address: string) => {
  pendingMiningClaims.delete(address)
}
