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

  const usdc = process.env.NEXT_PUBLIC_USDC_ADDRESS
  const banda = process.env.NEXT_PUBLIC_BANDA_TOKEN_ADDRESS
  const treasury = process.env.LOTTERY_TREASURY_ADDRESS || wallet.address
  const vrfCoordinator = process.env.VRF_COORDINATOR_ADDRESS

  if (!usdc || !banda || !vrfCoordinator) {
    throw new Error("Missing NEXT_PUBLIC_USDC_ADDRESS, NEXT_PUBLIC_BANDA_TOKEN_ADDRESS, or VRF_COORDINATOR_ADDRESS.")
  }

  const artifactPath = path.join(
    __dirname,
    "..",
    "artifacts",
    "contracts",
    "RhinoLakeLottery.sol",
    "RhinoLakeLottery.json",
  )
  const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8"))

  console.log("Deploying with:", wallet.address)
  console.log("USDC:", usdc)
  console.log("BANDA:", banda)
  console.log("Treasury:", treasury)
  console.log("VRF Coordinator:", vrfCoordinator)

  const factory = new ethers.ContractFactory(artifact.abi, artifact.bytecode, wallet)
  const contract = await factory.deploy(usdc, banda, treasury, vrfCoordinator)
  await contract.waitForDeployment()

  const address = await contract.getAddress()
  console.log("RhinoLakeLottery deployed to:", address)
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
