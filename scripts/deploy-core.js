// Deploys GradCertificate v2 + GradRewards against an already-deployed GRAD token.
// Usage: npx hardhat run scripts/deploy-core.js --network baseSepolia
const fs = require("fs");
const path = require("path");
const { ethers, network } = require("hardhat");
const cfg = require("../deploy.config.js");

const ERC20_ABI = ["function symbol() view returns (string)", "function totalSupply() view returns (uint256)"];
const need = (k) => { if (!cfg[k]) throw new Error(`Missing ${k}: set it in .env`); return cfg[k]; };

async function main() {
  const { chainId } = await ethers.provider.getNetwork();
  if (chainId === 8453n && process.env.CONFIRM_MAINNET !== "yes") {
    throw new Error("Refusing to deploy to Base mainnet without CONFIRM_MAINNET=yes (legal opinion + audit first).");
  }
  let gradRaw = cfg.gradAddress;
  if (!gradRaw) {  // fall back to the file written by deploy-token-suite.js
    const f = path.join(__dirname, "..", "deployments", `${network.name}-token.json`);
    if (fs.existsSync(f)) gradRaw = JSON.parse(fs.readFileSync(f)).grad;
  }
  if (!gradRaw) throw new Error("Set GRAD_ADDRESS in .env, or run deploy-token-suite.js first");
  const grad = ethers.getAddress(gradRaw);
  const admin = ethers.getAddress(need("adminSafe"));
  const signer = ethers.getAddress(need("voucherSigner"));
  const minter = ethers.getAddress(need("certificateMinter"));
  if (signer === minter) throw new Error("Use two different hot keys for voucherSigner and certificateMinter.");

  const [deployer] = await ethers.getSigners();
  if ([admin, signer, minter].includes(deployer.address)) {
    throw new Error("Deployer must not be the admin, signer or minter.");
  }

  const token = new ethers.Contract(grad, ERC20_ABI, deployer);
  const supply = await token.totalSupply();
  if (supply !== ethers.parseEther(cfg.expectedSupply)) {
    throw new Error(`GRAD supply is ${ethers.formatEther(supply)}, expected ${cfg.expectedSupply}. Wrong token address?`);
  }
  console.log(`Network ${network.name} (${chainId}), deployer ${deployer.address}`);
  console.log(`GRAD ${grad} (${await token.symbol()})\n`);

  const certArgs = [admin, minter];
  const cert = await (await ethers.getContractFactory("GradCertificate")).deploy(...certArgs);
  await cert.waitForDeployment();
  const certAddr = await cert.getAddress();
  console.log(`GradCertificate  ${certAddr}`);

  const rewardsArgs = [
    grad, certAddr, admin, signer,
    ethers.parseEther(cfg.courseReward), ethers.parseEther(cfg.referralReward), ethers.parseEther(cfg.annualCap),
  ];
  const rewards = await (await ethers.getContractFactory("GradRewards")).deploy(...rewardsArgs);
  await rewards.waitForDeployment();
  const rewardsAddr = await rewards.getAddress();
  console.log(`GradRewards      ${rewardsAddr}`);

  const dir = path.join(__dirname, "..", "deployments");
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${network.name}.json`);
  fs.writeFileSync(file, JSON.stringify({
    network: network.name, chainId: Number(chainId), deployer: deployer.address, grad,
    GradCertificate: { address: certAddr, args: certArgs.map(String) },
    GradRewards: { address: rewardsAddr, args: rewardsArgs.map(String) },
  }, null, 2));

  console.log(`\nSaved ${path.relative(process.cwd(), file)}\n`);
  console.log("Next steps:");
  console.log(`1. From the Community Safe, transfer ${cfg.poolFunding} GRAD to ${rewardsAddr}`);
  console.log(`2. npx hardhat verify --network ${network.name} ${certAddr} ${certArgs.join(" ")}`);
  console.log(`   npx hardhat verify --network ${network.name} ${rewardsAddr} ${rewardsArgs.map(String).join(" ")}`);
  console.log(`3. npx hardhat run scripts/check-core.js --network ${network.name}`);
}

module.exports = { main };
if (!process.env.NO_AUTORUN) main().catch((e) => { console.error(e); process.exitCode = 1; });
