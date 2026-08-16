// Standard Hardhat deployment script.
//
// Run with: npx hardhat run scripts/deploy.js --network sepolia
// (requires SEPOLIA_RPC_URL and DEPLOYER_PRIVATE_KEY env vars — see README)
//
// Deployment order matters: the vesting contracts must exist BEFORE
// GradToken is deployed, because GradToken's constructor mints team/investor/
// advisor tokens directly into them.
const hre = require("hardhat");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log("Deploying with account:", deployer.address);

  // --- Step 1: placeholder wallets/multisigs for the non-vested buckets ---
  // Replace these with your real multisig addresses before any real deploy.
  // For a first testnet pass it's fine to use the deployer for all of them.
  const communityEcosystemPool = deployer.address; // will later be GradStaking's funder, or a multisig
  const treasury = deployer.address;
  const publicSaleLiquidity = deployer.address;
  const marketing = deployer.address;

  // --- Step 2: deploy the three vesting contracts (need the token address,
  // so deploy them with address(0) as a temp placeholder is NOT an option
  // since GradVesting's constructor validates non-zero — instead we deploy
  // token first with vesting addresses precomputed via nonce, OR simpler:
  // deploy vesting contracts pointing at a token address we know in advance
  // isn't possible without CREATE2. The straightforward fix used here:
  // deploy GradToken FIRST with temporary EOA placeholders for team/investor/
  // advisor buckets, deploy the vesting contracts, then have the deployer
  // transfer those tokens into the vesting contracts and call
  // createSchedule(). This keeps GradToken's constructor simple and avoids
  // any CREATE2/address-prediction complexity for a Phase 1 testnet deploy.

  const GradToken = await hre.ethers.getContractFactory("GradToken");
  const token = await GradToken.deploy(
    communityEcosystemPool,
    deployer.address, // team bucket -> deployer for now, moved to vesting below
    treasury,
    publicSaleLiquidity,
    deployer.address, // investor bucket -> deployer for now, moved to vesting below
    marketing,
    deployer.address // advisor bucket -> deployer for now, moved to vesting below
  );
  await token.waitForDeployment();
  console.log("GradToken deployed:", await token.getAddress());

  const GradVesting = await hre.ethers.getContractFactory("GradVesting");

  const teamVesting = await GradVesting.deploy(await token.getAddress(), deployer.address);
  await teamVesting.waitForDeployment();
  console.log("Team GradVesting deployed:", await teamVesting.getAddress());

  const investorVesting = await GradVesting.deploy(await token.getAddress(), deployer.address);
  await investorVesting.waitForDeployment();
  console.log("Investor GradVesting deployed:", await investorVesting.getAddress());

  const advisorVesting = await GradVesting.deploy(await token.getAddress(), deployer.address);
  await advisorVesting.waitForDeployment();
  console.log("Advisor GradVesting deployed:", await advisorVesting.getAddress());

  // --- Step 3: move the team/investor/advisor tokens (currently sitting in
  // deployer's wallet) into their vesting contracts, per tokenomics.
  const teamAmount = (await token.TOTAL_SUPPLY()) * 1800n / 10000n;
  const investorAmount = (await token.TOTAL_SUPPLY()) * 1000n / 10000n;
  const advisorAmount = (await token.TOTAL_SUPPLY()) * 400n / 10000n;

  await (await token.transfer(await teamVesting.getAddress(), teamAmount)).wait();
  await (await token.transfer(await investorVesting.getAddress(), investorAmount)).wait();
  await (await token.transfer(await advisorVesting.getAddress(), advisorAmount)).wait();
  console.log("Vesting contracts funded.");

  // --- Step 4: deploy staking ---
  const GradStaking = await hre.ethers.getContractFactory("GradStaking");
  const staking = await GradStaking.deploy(await token.getAddress(), deployer.address);
  await staking.waitForDeployment();
  console.log("GradStaking deployed:", await staking.getAddress());

  console.log("\nNext manual steps (not automated on purpose — review before executing):");
  console.log("1. Call teamVesting.createSchedule(...) for each real team member.");
  console.log("2. Call investorVesting.createSchedule(...) for each real investor.");
  console.log("3. Call advisorVesting.createSchedule(...) for each real advisor.");
  console.log("4. Transfer some GRAD from the community/ecosystem pool into GradStaking, then call notifyRewardAmount().");
  console.log("5. Transfer ownership of GradVesting/GradStaking (Ownable2Step) to your multisig, not an EOA.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
