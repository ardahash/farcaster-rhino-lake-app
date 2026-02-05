export type PendingBandaClaim = {
  seconds: number
  amountRaw: bigint
  amount: string
  nonce: bigint
  deadline: number
  signature: `0x${string}`
}

const bandaLastClaim = new Map<string, number>()
const pendingBandaClaims = new Map<string, PendingBandaClaim>()

export const getBandaLastClaim = (address: string) => bandaLastClaim.get(address)

export const setBandaLastClaim = (address: string, timestamp: number) => {
  bandaLastClaim.set(address, timestamp)
  return timestamp
}

export const ensureBandaLastClaim = (address: string, now = Date.now()) => {
  const existing = bandaLastClaim.get(address)
  if (typeof existing === "number") {
    return { initialized: false, timestamp: existing }
  }
  bandaLastClaim.set(address, now)
  return { initialized: true, timestamp: now }
}

export const clearBandaLastClaim = (address: string) => {
  bandaLastClaim.delete(address)
}

export const getPendingBandaClaim = (address: string) => pendingBandaClaims.get(address)

export const setPendingBandaClaim = (address: string, claim: PendingBandaClaim) => {
  pendingBandaClaims.set(address, claim)
  return claim
}

export const clearPendingBandaClaim = (address: string) => {
  pendingBandaClaims.delete(address)
}
