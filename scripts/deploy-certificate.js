// scripts/deploy-certificate.js
//
// Deploys GradCertificate.sol — the soulbound on-chain credential contract
// for GradLearn course completions and partner-institution certificates.
//
// Independent of the GradToken/GradStaking suite — no dependency, no
// deploy-order requirement.
//
// Usage:
//   npx hardhat run scripts/deploy-certificate.js --network sepolia

const hre = require("hardhat");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log(`Deploying with account: ${deployer.address}`);
  console.log(`Network: ${hre.network.name}\n`);

  // Admin/minter for testnet: the deployer wallet.
  // Before mainnet, consider replacing this with a dedicated Safe multisig,
  // since this address controls who can issue and revoke credentials.
  const ADMIN_ADDRESS = deployer.address;

  console.log("Deploying GradCertificate...");
  const GradCertificate = await hre.ethers.getContractFactory("GradCertificate");
  const gradCertificate = await GradCertificate.deploy(ADMIN_ADDRESS);
  await gradCertificate.waitForDeployment();
  const gradCertificateAddress = await gradCertificate.getAddress();

  console.log(`GradCertificate deployed at: ${gradCertificateAddress}`);
  console.log(`Admin / MINTER_ROLE holder: ${ADMIN_ADDRESS}`);

  console.log("\n===== SUMMARY =====");
  console.log(`GradCertificate: ${gradCertificateAddress}`);
  console.log("\nNext: verify on Etherscan with:");
  console.log(
    `npx hardhat verify --network sepolia ${gradCertificateAddress} ${ADMIN_ADDRESS}`
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
