// scripts/deploy-phase5.js
//
// Redeploys the full GradToken Phase 5 suite with correct tokenomics
// destinations. Reuses the three existing GradVesting instances (team,
// investors, advisors) — only GradToken and GradStaking are redeployed,
// since GradToken's previous deployment sent 68% of supply to the deployer
// EOA instead of the intended Treasury/Marketing/Community/Public Sale
// addresses.
//
// Usage:
//   npx hardhat run scripts/deploy-phase5.js --network sepolia
//
// IMPORTANT: Double-check every address below against your Safe UI before
// running. A wrong address here is a one-time, unrecoverable mint to the
// wrong destination — there is no "undo" once the transaction confirms.

const hre = require("hardhat");

// ---- Existing GradVesting instances (reused, NOT redeployed) ----
const TEAM_VESTING = "0xc3c6591f151baeb04a0e7fd1bef88db5eb029e25";
const INVESTOR_VESTING = "0xe6785e1f00bef4546c964687c07ad61a2f949063";
const ADVISOR_VESTING = "0xb2dc75552281302acf475fc6ffca068537ff52aa";

// ---- New Safe multisig destinations ----
const TREASURY_SAFE = "0xC386280a9743BfD9841882dD6D7e7Bea12c0FDf5";
const MARKETING_SAFE = "0xb1d37E8734157b33Bcb5D6Af984324ba5122686e";
const COMMUNITY_SAFE = "0x960e9d737aC049202a057B93B8e08C24fcE64430";
const PUBLIC_SALE_SAFE = "0xEEf8e6124e5f597655BFb9a0F162D7ACA77ec333";

// Sanity list used for the pre-flight duplicate check below.
// NOTE: confirm this matches GradToken.sol's actual constructor parameter
// ORDER before running — adjust the deployToken() call further down if your
// contract's constructor takes these in a different sequence.
const ALL_DESTINATIONS = {
  communityEcosystemPool: COMMUNITY_SAFE,
  teamVesting: TEAM_VESTING,
  treasury: TREASURY_SAFE,
  publicSaleLiquidity: PUBLIC_SALE_SAFE,
  investorVesting: INVESTOR_VESTING,
  marketing: MARKETING_SAFE,
  advisorVesting: ADVISOR_VESTING,
};

function preflightCheck() {
  const entries = Object.entries(ALL_DESTINATIONS);

  // Catch accidental duplicate addresses (e.g. copy-paste error reusing
  // the same Safe for two buckets).
  const seen = new Map();
  for (const [name, address] of entries) {
    const normalized = address.toLowerCase();
    if (seen.has(normalized)) {
      throw new Error(
        `Duplicate address detected: "${name}" and "${seen.get(normalized)}" ` +
        `both point to ${address}. Fix before deploying.`
      );
    }
    seen.set(normalized, name);
  }

  // Catch placeholder/zero addresses.
  for (const [name, address] of entries) {
    if (!hre.ethers.isAddress(address)) {
      throw new Error(`Invalid address for "${name}": ${address}`);
    }
    if (address === hre.ethers.ZeroAddress) {
      throw new Error(`"${name}" is the zero address — this looks like a placeholder.`);
    }
  }

  console.log("Pre-flight check passed. Destinations:");
  for (const [name, address] of entries) {
    console.log(`  ${name.padEnd(22)} -> ${address}`);
  }
}

async function main() {
  preflightCheck();

  const [deployer] = await hre.ethers.getSigners();
  console.log(`\nDeploying with account: ${deployer.address}`);
  console.log(`Network: ${hre.network.name}\n`);

  // ---- 1. Deploy GradToken with correct constructor args ----
  // Adjust the argument order here to match GradToken.sol's actual
  // constructor signature if it differs from ALL_DESTINATIONS above.
  console.log("Deploying GradToken...");
  const GradToken = await hre.ethers.getContractFactory("GradToken");
  const gradToken = await GradToken.deploy(
    ALL_DESTINATIONS.communityEcosystemPool,
    ALL_DESTINATIONS.teamVesting,
    ALL_DESTINATIONS.treasury,
    ALL_DESTINATIONS.publicSaleLiquidity,
    ALL_DESTINATIONS.investorVesting,
    ALL_DESTINATIONS.marketing,
    ALL_DESTINATIONS.advisorVesting
  );
  await gradToken.waitForDeployment();
  const gradTokenAddress = await gradToken.getAddress();
  console.log(`GradToken deployed at: ${gradTokenAddress}`);

  // ---- 2. Verify the mint landed where expected ----
  // Cross-check on-chain balances against what we just requested, so a
  // constructor-argument-order mistake is caught immediately instead of
  // being discovered later via a manual Etherscan check.
  console.log("\nVerifying bucket balances...");
  const checks = [
    ["Community/Ecosystem", COMMUNITY_SAFE],
    ["Team Vesting", TEAM_VESTING],
    ["Treasury", TREASURY_SAFE],
    ["Public Sale/Liquidity", PUBLIC_SALE_SAFE],
    ["Investor Vesting", INVESTOR_VESTING],
    ["Marketing", MARKETING_SAFE],
    ["Advisor Vesting", ADVISOR_VESTING],
  ];
  let totalChecked = 0n;
  for (const [label, address] of checks) {
    const balance = await gradToken.balanceOf(address);
    totalChecked += balance;
    console.log(`  ${label.padEnd(24)} ${hre.ethers.formatEther(balance)} GRAD`);
  }
  console.log(`  ${"TOTAL".padEnd(24)} ${hre.ethers.formatEther(totalChecked)} GRAD`);

  const totalSupply = await gradToken.totalSupply();
  if (totalChecked !== totalSupply) {
    console.warn(
      `\n⚠️  WARNING: sum of the 7 bucket balances (${hre.ethers.formatEther(totalChecked)}) ` +
      `does not equal total supply (${hre.ethers.formatEther(totalSupply)}). ` +
      `Some tokens landed somewhere unexpected — check the deployer's own balance ` +
      `and investigate before proceeding to GradStaking.`
    );
    const deployerBalance = await gradToken.balanceOf(deployer.address);
    console.warn(`   Deployer balance: ${hre.ethers.formatEther(deployerBalance)} GRAD`);
  } else {
    console.log("\n✅ All supply accounted for across the 7 intended buckets. Safe to proceed.");
  }

  // ---- 3. Deploy GradStaking pointing at the NEW GradToken address ----
  console.log("\nDeploying GradStaking...");
  const GradStaking = await hre.ethers.getContractFactory("GradStaking");
  const gradStaking = await GradStaking.deploy(gradTokenAddress);
  await gradStaking.waitForDeployment();
  const gradStakingAddress = await gradStaking.getAddress();
  console.log(`GradStaking deployed at: ${gradStakingAddress}`);

  // ---- Summary ----
  console.log("\n===== DEPLOYMENT SUMMARY =====");
  console.log(`GradToken:   ${gradTokenAddress}`);
  console.log(`GradStaking: ${gradStakingAddress}`);
  console.log(`Team Vesting (reused):     ${TEAM_VESTING}`);
  console.log(`Investor Vesting (reused): ${INVESTOR_VESTING}`);
  console.log(`Advisor Vesting (reused):  ${ADVISOR_VESTING}`);
  console.log(`Treasury Safe:             ${TREASURY_SAFE}`);
  console.log(`Marketing Safe:            ${MARKETING_SAFE}`);
  console.log(`Community Safe:            ${COMMUNITY_SAFE}`);
  console.log(`Public Sale Safe:          ${PUBLIC_SALE_SAFE}`);
  console.log("\nNext: verify both contracts on Etherscan, then re-check the");
  console.log("'Holders' tab on GradToken's token page to confirm 7 distinct");
  console.log("recipients (not the deployer) hold the full supply.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
