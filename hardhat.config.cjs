require("dotenv").config();
require("@nomicfoundation/hardhat-verify");

module.exports = {
  solidity: "0.8.20",
  networks: {
    base: {
      type: "http",
      url: "https://mainnet.base.org",
      accounts: process.env.BAR_REWARD_PRIVATE_KEY
        ? [process.env.BAR_REWARD_PRIVATE_KEY.startsWith("0x")
            ? process.env.BAR_REWARD_PRIVATE_KEY
            : `0x${process.env.BAR_REWARD_PRIVATE_KEY}`]
        : process.env.BASE_PRIVATE_KEY
          ? [process.env.BASE_PRIVATE_KEY.startsWith("0x")
              ? process.env.BASE_PRIVATE_KEY
              : `0x${process.env.BASE_PRIVATE_KEY}`]
          : [],
      chainId: 8453,
    },
  },
  etherscan: {
    apiKey: {
      base: process.env.BASESCAN_API_KEY || "",
    },
    customChains: [
      {
        network: "base",
        chainId: 8453,
        urls: {
          apiURL: "https://api.basescan.org/api",
          browserURL: "https://basescan.org",
        },
      },
    ],
  },
};
