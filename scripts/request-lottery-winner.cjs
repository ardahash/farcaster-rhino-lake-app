const { ethers } = require("ethers")
require("dotenv").config()

async function main() {
  const rawKey = process.env.BAR_REWARD_PRIVATE_KEY || process.env.BASE_PRIVATE_KEY
  if (!rawKey) {
    throw new Error("Missing BAR_REWARD_PRIVATE_KEY or BASE_PRIVATE_KEY")
  }
  const privateKey = rawKey.startsWith("0x") ? rawKey : `0x${rawKey}`
  const provider = new ethers.JsonRpcProvider("https://mainnet.base.org")
  const deployer = new ethers.Wallet(privateKey, provider)

  const lotteryAddress = process.env.NEXT_PUBLIC_LOTTERY_ADDRESS
  const keyHash = process.env.VRF_KEY_HASH
  const subId = process.env.VRF_SUBSCRIPTION_ID
  const callbackGasLimit = process.env.VRF_CALLBACK_GAS_LIMIT || "500000"
  const confirmations = process.env.VRF_REQUEST_CONFIRMATIONS || "3"

  if (!lotteryAddress || !keyHash || !subId) {
    throw new Error("Missing NEXT_PUBLIC_LOTTERY_ADDRESS / VRF_KEY_HASH / VRF_SUBSCRIPTION_ID")
  }

  const Lottery = new ethers.Contract(
    lotteryAddress,
    ["function requestWinner(bytes32,uint64,uint32,uint16) returns (uint256)"],
    deployer,
  )
  const tx = await Lottery.requestWinner(
    keyHash,
    subId,
    Number(callbackGasLimit),
    Number(confirmations),
  )
  await tx.wait()
  console.log("Winner requested.")
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
