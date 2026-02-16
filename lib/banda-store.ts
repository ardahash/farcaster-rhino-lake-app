import { mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"

export type PendingBandaClaim = {
  seconds: number
  amountRaw: bigint
  amount: string
  nonce: bigint
  deadline: number
  signature: `0x${string}`
}

type PersistedBandaStore = {
  lastClaim: Record<string, number>
}

const STORE_PATH = path.join(process.cwd(), "cache", "banda-store.json")
const DEFAULT_STORE: PersistedBandaStore = { lastClaim: {} }

let persistedStore: PersistedBandaStore | null = null
let loadPromise: Promise<PersistedBandaStore> | null = null
let writeQueue: Promise<void> = Promise.resolve()
const pendingBandaClaims = new Map<string, PendingBandaClaim>()

const loadStore = async () => {
  if (persistedStore) {
    return persistedStore
  }
  if (loadPromise) {
    return loadPromise
  }

  loadPromise = (async () => {
    try {
      const raw = await readFile(STORE_PATH, "utf8")
      const parsed = JSON.parse(raw) as Partial<PersistedBandaStore>
      const lastClaim = parsed.lastClaim ?? {}
      persistedStore = { lastClaim }
      return persistedStore
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code
      if (code !== "ENOENT") {
        throw error
      }
      persistedStore = { ...DEFAULT_STORE }
      return persistedStore
    }
  })()

  return loadPromise
}

const persistStore = async (store: PersistedBandaStore) => {
  await mkdir(path.dirname(STORE_PATH), { recursive: true })
  await writeFile(STORE_PATH, JSON.stringify(store), "utf8")
}

const queuePersist = async (store: PersistedBandaStore) => {
  writeQueue = writeQueue.catch(() => undefined).then(() => persistStore(store))
  return writeQueue
}

export const getBandaLastClaim = async (address: string) => {
  const store = await loadStore()
  return store.lastClaim[address]
}

export const setBandaLastClaim = async (address: string, timestamp: number) => {
  const store = await loadStore()
  store.lastClaim[address] = timestamp
  await queuePersist(store)
  return timestamp
}

export const ensureBandaLastClaim = async (address: string, now = Date.now()) => {
  const store = await loadStore()
  const existing = store.lastClaim[address]
  if (typeof existing === "number") {
    return { initialized: false, timestamp: existing }
  }
  store.lastClaim[address] = now
  await queuePersist(store)
  return { initialized: true, timestamp: now }
}

export const clearBandaLastClaim = async (address: string) => {
  const store = await loadStore()
  delete store.lastClaim[address]
  await queuePersist(store)
}

export const getPendingBandaClaim = (address: string) => pendingBandaClaims.get(address)

export const setPendingBandaClaim = (address: string, claim: PendingBandaClaim) => {
  pendingBandaClaims.set(address, claim)
  return claim
}

export const clearPendingBandaClaim = (address: string) => {
  pendingBandaClaims.delete(address)
}
