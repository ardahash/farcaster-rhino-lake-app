const fs = require("fs")
const path = require("path")
const { ethers } = require("ethers")
require("dotenv").config()

const DEFAULT_USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"

async function main() {
  const rawKey = process.env.BAR_REWARD_PRIVATE_KEY || process.env.BASE_PRIVATE_KEY
  if (!rawKey) {
    throw new Error("Missing BAR_REWARD_PRIVATE_KEY or BASE_PRIVATE_KEY in env.")
  }

  const privateKey = rawKey.startsWith("0x") ? rawKey : `0x${rawKey}`
  const rpcUrl = "https://mainnet.base.org"
  const provider = new ethers.JsonRpcProvider(rpcUrl)
  const wallet = new ethers.Wallet(privateKey, provider)

  const owner = process.env.PLINKO_OWNER_ADDRESS || wallet.address
  const usdc = process.env.NEXT_PUBLIC_USDC_ADDRESS || DEFAULT_USDC

  const artifactPath = path.join(
    __dirname,
    "..",
    "artifacts",
    "contracts",
    "RhinoLakePlinko.sol",
    "RhinoLakePlinko.json",
  )
  const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8"))

  console.log("Deployer:", wallet.address)
  console.log("Owner:", owner)
  console.log("USDC:", usdc)

  const factory = new ethers.ContractFactory(artifact.abi, artifact.bytecode, wallet)
  const contract = await factory.deploy(usdc, owner)
  await contract.waitForDeployment()
  const address = await contract.getAddress()
  console.log("Plinko:", address)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
