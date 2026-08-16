require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();

/** @type {import('hardhat/config').HardhatUserConfig} */
module.exports = {
  solidity: {
    version: "0.8.24",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
      // Reverts with reason strings/panics instead of silent overflow;
      // 0.8.x has built-in overflow/underflow checks, this just confirms it.
      viaIR: false,
    },
  },
  networks: {
    hardhat: {},
    // Fill in via env vars when you're ready to actually deploy to Sepolia.
    sepolia: {
      url: process.env.SEPOLIA_RPC_URL || "",
      accounts: process.env.DEPLOYER_PRIVATE_KEY ? [process.env.DEPLOYER_PRIVATE_KEY] : [],
    },
  },
    etherscan: {
      apiKey: process.env.ETHERSCAN_API_KEY,
   },
};
      