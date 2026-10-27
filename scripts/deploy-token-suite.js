// Deploys GradToken + the three GradLockedVesting contracts on the right chain, in the one order that works.
// The token's constructor mints each bucket straight to its destination, and the vesting contracts need the
// token's address, so the token address is predicted from the deployer's nonce and checked after deploy.
// Usage: npx hardhat run scripts/deploy-token-suite.js --network baseSepolia
// Env: ADMIN_SAFE, COMMUNITY_SAFE, TREASURY_SAFE, MARKETING_SAFE, PUBLIC_SALE_SAFE, REHEARSAL=yes (short vesting terms)
const fs = require("fs");
const path = require("path");
const { ethers, network } = require("hardhat");

const MONTH = 2629800; // 30.4375 days
const DAY = 86400;
const bps = (total, n) => (total * BigInt(n)) / 10000n;

async function main() {
  const env = process.env;
  const need = (k) => { if (!env[k]) throw new Error(`Missing ${k} in .env`); return ethers.getAddress(env[k]); };
  const { chainId } = await ethers.provider.getNetwork();
  if (chainId === 8453n && env.CONFIRM_MAINNET !== "yes") {
    throw new Error("Refusing to deploy to Base mainnet without CONFIRM_MAINNET=yes (legal opinion + audit first).");
  }
  const rehearsal = env.REHEARSAL === "yes";
  if (rehearsal && chainId === 8453n) throw new Error("REHEARSAL terms must never be used on mainnet.");

  const safes = {
    admin: need("ADMIN_SAFE"), community: need("COMMUNITY_SAFE"), treasury: need("TREASURY_SAFE"),
    marketing: need("MARKETING_SAFE"), publicSale: need("PUBLIC_SALE_SAFE"),
  };
  const [deployer] = await ethers.getSigners();
  const all = [deployer.address, ...Object.values(safes)];
  if (new Set(all).size !== all.length) throw new Error("Deployer and the five Safes must all be different addresses.");

  // group: [cliff, linear-after-cliff, revocable]
  const terms = rehearsal
    ? { team: [DAY, 7 * DAY, true], investors: [DAY, 7 * DAY, false], advisors: [DAY, 7 * DAY, false] }
    : { team: [12 * MONTH, 36 * MONTH, true], investors: [12 * MONTH, 24 * MONTH, false], advisors: [6 * MONTH, 18 * MONTH, false] };

  console.log(`Network ${network.name} (${chainId}), deployer ${deployer.address}, ${rehearsal ? "REHEARSAL terms (1 day cliff + 7 days)" : "REAL terms"}`);

  const nonce = await ethers.provider.getTransactionCount(deployer.address, "pending");
  const predicted = ethers.getCreateAddress({ from: deployer.address, nonce: nonce + 3 });
  console.log(`Predicted GRAD address ${predicted}\n`);

  const Vesting = await ethers.getContractFactory("GradLockedVesting");
  const vesting = {};
  for (const group of ["team", "investors", "advisors"]) {
    const [cliff, linear, revocable] = terms[group];
    const args = [predicted, safes.admin, cliff, linear, revocable, safes.treasury];
    const c = await Vesting.deploy(...args);
    await c.waitForDeployment();
    vesting[group] = { contract: c, address: await c.getAddress(), args: args.map(String) };
    console.log(`GradLockedVesting ${group.padEnd(9)} ${vesting[group].address}`);
  }

  // Order matches GradToken's constructor: community, teamVesting, treasury, publicSale, investorVesting, marketing, advisorVesting
  const tokenArgs = [safes.community, vesting.team.address, safes.treasury, safes.publicSale, vesting.investors.address, safes.marketing, vesting.advisors.address];
  const token = await (await ethers.getContractFactory("GradToken")).deploy(...tokenArgs);
  await token.waitForDeployment();
  const grad = await token.getAddress();
  console.log(`GradToken                 ${grad}`);
  if (grad !== predicted) throw new Error(`Token address ${grad} does not match prediction ${predicted}. The vesting contracts point at the wrong token. Do not use this deploy.`);

  const total = await token.TOTAL_SUPPLY();
  const expected = [
    ["Community", safes.community, 3500], ["Team vesting", vesting.team.address, 1800], ["Treasury", safes.treasury, 1500],
    ["Public sale", safes.publicSale, 1200], ["Investor vesting", vesting.investors.address, 1000],
    ["Marketing", safes.marketing, 600], ["Advisor vesting", vesting.advisors.address, 400],
  ];
  console.log("\nBuckets:");
  for (const [name, addr, n] of expected) {
    const bal = await token.balanceOf(addr);
    if (bal !== bps(total, n)) throw new Error(`${name} holds ${ethers.formatEther(bal)}, expected ${ethers.formatEther(bps(total, n))}`);
    console.log(`  OK  ${name.padEnd(17)} ${ethers.formatEther(bal)} GRAD`);
  }
  if ((await token.balanceOf(deployer.address)) !== 0n) throw new Error("Deployer holds tokens. Something is wrong.");

  const dir = path.join(__dirname, "..", "deployments");
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${network.name}-token.json`);
  fs.writeFileSync(file, JSON.stringify({
    network: network.name, chainId: Number(chainId), deployer: deployer.address, rehearsal, grad,
    GradToken: { address: grad, args: tokenArgs },
    vesting: Object.fromEntries(Object.entries(vesting).map(([k, v]) => [k, { address: v.address, args: v.args }])),
    safes,
  }, null, 2));
  console.log(`\nSaved ${path.relative(process.cwd(), file)}`);
  console.log("Next: npx hardhat run scripts/deploy-core.js --network " + network.name + "  (it reads the GRAD address from that file)");
  console.log(`Verify: npx hardhat verify --network ${network.name} ${grad} ${tokenArgs.join(" ")}`);
  for (const [k, v] of Object.entries(vesting)) console.log(`        npx hardhat verify --network ${network.name} ${v.address} ${v.args.join(" ")}`);
  return { grad, vesting, safes, terms };
}

module.exports = { main };
if (!process.env.NO_AUTORUN) main().catch((e) => { console.error(e); process.exitCode = 1; });
