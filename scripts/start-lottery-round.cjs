const { CdpClient } = require("@coinbase/cdp-sdk")
const { ethers } = require("ethers")
require("dotenv").config()

const TICKET_ETH_WEI = 360000000000000n

const getCdpClient = () => {
  const apiKeyId = process.env.CDP_API_KEY_ID
  const apiKeySecret = process.env.CDP_API_KEY_SECRET
  const walletSecret = process.env.CDP_WALLET_SECRET
  if (!apiKeyId || !apiKeySecret) {
    throw new Error("Missing CDP_API_KEY_ID / CDP_API_KEY_SECRET")
  }
  return new CdpClient({ apiKeyId, apiKeySecret, walletSecret })
}

async function fetchQuote(fromToken, toToken, taker) {
  const cdp = getCdpClient()
  const quote = await cdp.evm.createSwapQuote({
    network: "base",
    fromToken,
    toToken,
    fromAmount: TICKET_ETH_WEI,
    taker,
    slippageBps: 50,
  })
  if (!quote?.toAmount) {
    throw new Error("Quote unavailable.")
  }
  return BigInt(quote.toAmount.toString())
}

async function main() {
  const rawKey = process.env.BAR_REWARD_PRIVATE_KEY || process.env.BASE_PRIVATE_KEY
  if (!rawKey) {
    throw new Error("Missing BAR_REWARD_PRIVATE_KEY or BASE_PRIVATE_KEY")
  }
  const privateKey = rawKey.startsWith("0x") ? rawKey : `0x${rawKey}`
  const provider = new ethers.JsonRpcProvider("https://mainnet.base.org")
  const deployer = new ethers.Wallet(privateKey, provider)
  const lotteryAddress = process.env.NEXT_PUBLIC_LOTTERY_ADDRESS
  const usdc = process.env.NEXT_PUBLIC_USDC_ADDRESS
  const banda = process.env.NEXT_PUBLIC_BANDA_TOKEN_ADDRESS

  if (!lotteryAddress || !usdc || !banda) {
    throw new Error("Missing NEXT_PUBLIC_LOTTERY_ADDRESS / NEXT_PUBLIC_USDC_ADDRESS / NEXT_PUBLIC_BANDA_TOKEN_ADDRESS")
  }

  const Lottery = new ethers.Contract(
    lotteryAddress,
    ["function startNewRound(uint256,uint256,uint256)"],
    deployer,
  )
  const usdcContract = new ethers.Contract(
    usdc,
    ["function balanceOf(address) view returns (uint256)", "function approve(address,uint256) returns (bool)"],
    deployer,
  )

  const treasury = deployer.address
  const bandaQuote = await fetchQuote("0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE", banda, treasury)
  const usdcQuote = await fetchQuote("0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE", usdc, treasury)
  const usdcFee = 100000n
  const usdcTotal = usdcQuote + usdcFee

  const balance = await usdcContract.balanceOf(treasury)
  const potInitial = balance / 2n

  console.log("Ticket price BANDA (base):", bandaQuote.toString())
  console.log("Ticket price USDC (total):", usdcTotal.toString())
  console.log("Initial pot (USDC):", potInitial.toString())

  if (potInitial > 0n) {
    const approveTx = await usdcContract.approve(lotteryAddress, potInitial)
    await approveTx.wait()
  }

  const tx = await Lottery.startNewRound(bandaQuote, usdcTotal, potInitial)
  await tx.wait()

  console.log("Round started.")
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
