const fs = require("fs")
const path = require("path")
const { ethers } = require("ethers")
require("dotenv").config()

async function main() {
  const rawKey = process.env.BAR_REWARD_PRIVATE_KEY || process.env.BASE_PRIVATE_KEY
  if (!rawKey) {
    throw new Error("Missing BAR_REWARD_PRIVATE_KEY or BASE_PRIVATE_KEY in env.")
  }

  const privateKey = rawKey.startsWith("0x") ? rawKey : `0x${rawKey}`
  const rpcUrl = process.env.NEXT_PUBLIC_BASE_RPC_URL || "https://mainnet.base.org"
  const provider = new ethers.JsonRpcProvider(rpcUrl)
  const wallet = new ethers.Wallet(privateKey, provider)

  const barToken =
    process.env.NEXT_PUBLIC_BAR_TOKEN_ADDRESS || "0x1637b8c1Fba28E99776229DF6a7D9f5213E20b07"
  const bandaToken = process.env.NEXT_PUBLIC_BANDA_TOKEN_ADDRESS || "0x16e64C590136D0136E8440f64E99929DFE4b9B07"

  const artifactPath = path.join(
    __dirname,
    "..",
    "artifacts",
    "contracts",
    "MiningRewards.sol",
    "MiningRewards.json",
  )
  if (!fs.existsSync(artifactPath)) {
    throw new Error("Missing artifact for MiningRewards. Run `npx hardhat compile` first.")
  }
  const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8"))

  console.log("Deployer/Signer:", wallet.address)
  console.log("BAR token:", barToken)
  console.log("BANDA token:", bandaToken)

  const factory = new ethers.ContractFactory(artifact.abi, artifact.bytecode, wallet)

  console.log("\nDeploying BAR mining rewards contract...")
  const barRewards = await factory.deploy(wallet.address, barToken, wallet.address)
  await barRewards.waitForDeployment()
  const barRewardsAddress = await barRewards.getAddress()
  console.log("BAR MiningRewards:", barRewardsAddress)

  console.log("\nDeploying BANDA mining rewards contract...")
  const bandaRewards = await factory.deploy(wallet.address, bandaToken, wallet.address)
  await bandaRewards.waitForDeployment()
  const bandaRewardsAddress = await bandaRewards.getAddress()
  console.log("BANDA MiningRewards:", bandaRewardsAddress)

  console.log("\nSet these in .env:")
  console.log(`NEXT_PUBLIC_BAR_MINING_REWARD_ADDRESS=${barRewardsAddress}`)
  console.log(`NEXT_PUBLIC_BANDA_MINING_REWARD_ADDRESS=${bandaRewardsAddress}`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
