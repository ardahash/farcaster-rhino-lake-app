export const SPIN_REWARDS = ["0.5", "1", "10", "20", "50", "100", "1000"] as const
export const SPIN_WINDOW_MS = 24 * 60 * 60 * 1000

export const getSpinStorageKey = (address: string) => `rhino-lake:bar-spin:${address.toLowerCase()}`

export const formatSpinCooldown = (ms: number) => {
  const totalMinutes = Math.ceil(ms / 60000)
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  if (hours <= 0) {
    return `${minutes}m`
  }
  return `${hours}h ${minutes}m`
}
