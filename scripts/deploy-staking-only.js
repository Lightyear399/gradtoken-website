// scripts/deploy-staking-only.js
//
// Follow-up to deploy-phase5.js. GradToken already deployed successfully
// (see console output from that run). This script deploys ONLY GradStaking,
// pointing at that existing GradToken address, with the correct 2-argument
// constructor: (tokenAddress, ownerAddress).
//
// Usage:
//   npx hardhat run scripts/deploy-staking-only.js --network sepolia

const hre = require("hardhat");

// The GradToken address from the successful deploy-phase5.js run.
const GRAD_TOKEN_ADDRESS = "0x95A69bcbF176497241887f9CcFd8EcBC4e596587";

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log(`Deploying with account: ${deployer.address}`);
  console.log(`Network: ${hre.network.name}`);
  console.log(`Pointing at GradToken: ${GRAD_TOKEN_ADDRESS}\n`);

  console.log("Deploying GradStaking...");
  const GradStaking = await hre.ethers.getContractFactory("GradStaking");
  const gradStaking = await GradStaking.deploy(GRAD_TOKEN_ADDRESS, deployer.address);
  await gradStaking.waitForDeployment();
  const gradStakingAddress = await gradStaking.getAddress();
  console.log(`GradStaking deployed at: ${gradStakingAddress}`);

  console.log("\n===== SUMMARY =====");
  console.log(`GradToken:   ${GRAD_TOKEN_ADDRESS}`);
  console.log(`GradStaking: ${gradStakingAddress}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
