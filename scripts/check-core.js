// Post-deploy sanity check. Usage: npx hardhat run scripts/check-core.js --network baseSepolia
const fs = require("fs");
const path = require("path");
const { ethers, network } = require("hardhat");
const cfg = require("../deploy.config.js");

async function main() {
  const d = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "deployments", `${network.name}.json`)));
  const cert = await ethers.getContractAt("GradCertificate", d.GradCertificate.address);
  const rewards = await ethers.getContractAt("GradRewards", d.GradRewards.address);
  const erc20 = new ethers.Contract(d.grad, ["function balanceOf(address) view returns (uint256)"], ethers.provider);
  const E = (v) => ethers.parseEther(String(v));
  let bad = 0;
  const ok = (cond, msg) => { console.log(`${cond ? "OK  " : "FAIL"} ${msg}`); if (!cond) bad++; };

  const ADMIN = await cert.DEFAULT_ADMIN_ROLE();
  ok(await cert.hasRole(ADMIN, cfg.adminSafe), "certificate admin is the Safe");
  ok(!(await cert.hasRole(ADMIN, d.deployer)), "deployer holds no certificate admin role");
  ok(await cert.hasRole(await cert.MINTER_ROLE(), cfg.certificateMinter), "certificate minter is the backend key");
  ok(!(await cert.hasRole(await cert.MINTER_ROLE(), d.deployer)), "deployer is not a minter");

  ok(await rewards.hasRole(ADMIN, cfg.adminSafe), "rewards admin is the Safe");
  ok(!(await rewards.hasRole(ADMIN, d.deployer)), "deployer holds no rewards admin role");
  ok((await rewards.voucherSigner()) === ethers.getAddress(cfg.voucherSigner), "voucher signer set");
  ok((await rewards.grad()) === ethers.getAddress(d.grad), "rewards points at GRAD");
  ok((await rewards.certificate()) === d.GradCertificate.address, "rewards points at certificate");
  ok((await rewards.courseReward()) === E(cfg.courseReward), `course reward ${cfg.courseReward}`);
  ok((await rewards.referralReward()) === E(cfg.referralReward), `referral reward ${cfg.referralReward}`);
  ok((await rewards.annualCap()) === E(cfg.annualCap), `annual cap ${cfg.annualCap}`);

  const bal = await erc20.balanceOf(d.GradRewards.address);
  ok(bal === E(cfg.poolFunding), `rewards pool funded with ${cfg.poolFunding} GRAD (has ${ethers.formatEther(bal)})`);
  console.log(bad ? `\n${bad} check(s) failed` : "\nAll checks passed");
  if (bad) process.exitCode = 1;
}

module.exports = { main };
if (!process.env.NO_AUTORUN) main().catch((e) => { console.error(e); process.exitCode = 1; });
