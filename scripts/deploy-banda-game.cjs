const fs = require("fs")
const path = require("path")
const { ethers } = require("ethers")
require("dotenv").config()

const DEFAULT_BAR = "0x1637b8c1Fba28E99776229DF6a7D9f5213E20b07"
const DEFAULT_BANDA = "0x16e64C590136D0136E8440f64E99929DFE4b9B07"

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
  const bar = process.env.NEXT_PUBLIC_BAR_TOKEN_ADDRESS || DEFAULT_BAR
  const banda = process.env.NEXT_PUBLIC_BANDA_TOKEN_ADDRESS || DEFAULT_BANDA

  const cityArtifactPath = path.join(__dirname, "..", "artifacts", "contracts", "CityNFT.sol", "CityNFT.json")
  const cityArtifact = JSON.parse(fs.readFileSync(cityArtifactPath, "utf8"))

  const gameArtifactPath = path.join(__dirname, "..", "artifacts", "contracts", "RhinoLakeGame.sol", "RhinoLakeGame.json")
  const gameArtifact = JSON.parse(fs.readFileSync(gameArtifactPath, "utf8"))

  console.log("Deployer:", owner)
  console.log("BAR:", bar)
  console.log("BANDA:", banda)

  const cityFactory = new ethers.ContractFactory(cityArtifact.abi, cityArtifact.bytecode, wallet)
  const city = await cityFactory.deploy(owner)
  await city.waitForDeployment()
  const cityAddress = await city.getAddress()
  console.log("CityNFT:", cityAddress)

  const gameFactory = new ethers.ContractFactory(gameArtifact.abi, gameArtifact.bytecode, wallet)
  const game = await gameFactory.deploy(owner, bar, banda, cityAddress)
  await game.waitForDeployment()
  const gameAddress = await game.getAddress()
  console.log("Game:", gameAddress)

  const tx = await city.transferOwnership(gameAddress)
  await tx.wait()
  console.log("CityNFT ownership transferred to Game ✅")

  const cooldown = 10 * 60
  const attackCost = ethers.parseUnits("10", 18)
  const setTx = await game.setAttackParams(cooldown, attackCost)
  await setTx.wait()
  console.log("Attack params set ✅")
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
