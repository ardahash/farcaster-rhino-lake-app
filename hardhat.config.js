import "dotenv/config"

const rawKey = process.env.BAR_REWARD_PRIVATE_KEY || process.env.BASE_PRIVATE_KEY
const privateKey = rawKey
  ? rawKey.startsWith("0x")
    ? rawKey
    : `0x${rawKey}`
  : undefined

export default {
  solidity: "0.8.20",
  networks: {
    base: {
      type: "http",
      url: "https://mainnet.base.org",
      accounts: privateKey ? [privateKey] : [],
      chainId: 8453,
    },
  },
}
