// Merge into your existing hardhat.config.js (do NOT replace the file).
// 1) near the top, if not already there:  require("dotenv").config();
const accounts = process.env.DEPLOYER_PRIVATE_KEY ? [process.env.DEPLOYER_PRIVATE_KEY] : [];

// 2) inside module.exports -> networks, add:
//   baseSepolia: { url: process.env.BASE_SEPOLIA_RPC || "https://sepolia.base.org", chainId: 84532, accounts },
//   base:        { url: process.env.BASE_RPC || "https://mainnet.base.org", chainId: 8453, accounts },

// 3) inside module.exports -> etherscan, use one key for Etherscan and Basescan:
//   etherscan: { apiKey: process.env.ETHERSCAN_API_KEY || process.env.BASESCAN_API_KEY || "" },

// Solidity must be 0.8.24 with the optimizer on (runs: 200), as your existing config already has.
