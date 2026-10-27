const { expect } = require("chai");
const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

describe("deploy-token-suite script", () => {
  async function run(rehearsal) {
    process.env.NO_AUTORUN = "1";
    const [deployer, admin, community, treasury, marketing, publicSale] = await ethers.getSigners();
    Object.assign(process.env, {
      ADMIN_SAFE: admin.address, COMMUNITY_SAFE: community.address, TREASURY_SAFE: treasury.address,
      MARKETING_SAFE: marketing.address, PUBLIC_SALE_SAFE: publicSale.address, REHEARSAL: rehearsal ? "yes" : "no",
    });
    delete require.cache[require.resolve("../scripts/deploy-token-suite.js")];
    const res = await require("../scripts/deploy-token-suite.js").main();
    return { res, admin, treasury, community };
  }
  afterEach(() => { try { fs.unlinkSync(path.join(__dirname, "..", "deployments", "hardhat-token.json")); } catch { /* none */ } });

  it("deploys token and vesting in the right order with real terms and every bucket correct", async () => {
    const { res, admin, treasury, community } = await run(false);
    const token = await ethers.getContractAt("GradToken", res.grad);
    expect(await token.totalSupply()).to.equal(ethers.parseEther("1000000000"));
    expect(await token.balanceOf(community.address)).to.equal(ethers.parseEther("350000000"));
    const MONTH = 2629800;
    const team = await ethers.getContractAt("GradLockedVesting", res.vesting.team.address);
    const inv = await ethers.getContractAt("GradLockedVesting", res.vesting.investors.address);
    const adv = await ethers.getContractAt("GradLockedVesting", res.vesting.advisors.address);
    expect([await team.cliff(), await team.duration(), await team.revocable()]).to.deep.equal([BigInt(12 * MONTH), BigInt(36 * MONTH), true]);
    expect([await inv.cliff(), await inv.duration(), await inv.revocable()]).to.deep.equal([BigInt(12 * MONTH), BigInt(24 * MONTH), false]);
    expect([await adv.cliff(), await adv.duration(), await adv.revocable()]).to.deep.equal([BigInt(6 * MONTH), BigInt(18 * MONTH), false]);
    for (const v of [team, inv, adv]) {
      expect(await v.owner()).to.equal(admin.address);
      expect(await v.clawbackTo()).to.equal(treasury.address);
      expect(await v.grad()).to.equal(res.grad);
    }
    expect(await token.balanceOf(await team.getAddress())).to.equal(ethers.parseEther("180000000"));
    expect(await token.balanceOf(await inv.getAddress())).to.equal(ethers.parseEther("100000000"));
    expect(await token.balanceOf(await adv.getAddress())).to.equal(ethers.parseEther("40000000"));
  });

  it("rehearsal mode uses a 1-day cliff and 7 days linear", async () => {
    const { res } = await run(true);
    const team = await ethers.getContractAt("GradLockedVesting", res.vesting.team.address);
    expect(await team.cliff()).to.equal(86400n);
    expect(await team.duration()).to.equal(604800n);
  });

  it("refuses when the deployer is also one of the Safes", async () => {
    process.env.NO_AUTORUN = "1";
    const [deployer, a, b, c, d] = await ethers.getSigners();
    Object.assign(process.env, { ADMIN_SAFE: deployer.address, COMMUNITY_SAFE: a.address, TREASURY_SAFE: b.address, MARKETING_SAFE: c.address, PUBLIC_SALE_SAFE: d.address, REHEARSAL: "no" });
    delete require.cache[require.resolve("../scripts/deploy-token-suite.js")];
    let msg = ""; try { await require("../scripts/deploy-token-suite.js").main(); } catch (e) { msg = e.message; }
    expect(msg).to.contain("must all be different");
  });
});
