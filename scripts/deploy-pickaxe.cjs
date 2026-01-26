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
  const rpcUrl = "https://mainnet.base.org"
  const provider = new ethers.JsonRpcProvider(rpcUrl)
  const wallet = new ethers.Wallet(privateKey, provider)

  const owner = wallet.address
  const treasury = wallet.address
  const usdc = process.env.NEXT_PUBLIC_USDC_ADDRESS

  if (!usdc) {
    throw new Error("Missing NEXT_PUBLIC_USDC_ADDRESS in env.")
  }

  const artifactPath = path.join(
    __dirname,
    "..",
    "artifacts",
    "contracts",
    "PickaxeNFT.sol",
    "PickaxeNFT.json",
  )
  const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8"))

  console.log("Deployer:", wallet.address)
  console.log("USDC:", usdc)

  const factory = new ethers.ContractFactory(artifact.abi, artifact.bytecode, wallet)
  const contract = await factory.deploy(owner, usdc, treasury)
  await contract.waitForDeployment()

  const address = await contract.getAddress()
  console.log("PickaxeNFT:", address)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
