const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time, takeSnapshot } = require("@nomicfoundation/hardhat-network-helpers");

const MONTH = 2629800; // 30.4375 days
const AMT = ethers.parseEther("1000");
const PROFILES = { team: [12, 36], investors: [12, 24], advisors: [6, 18] };
const near = (a, b, tol) => (a > b ? a - b : b - a) <= tol;

async function setup([cliffM, linearM] = PROFILES.team, revocable = false) {
  const [deployer, safe, treasury, ben, ben2, stranger] = await ethers.getSigners();
  const token = await (await ethers.getContractFactory("MockGRAD")).deploy();
  const v = await (await ethers.getContractFactory("GradLockedVesting")).deploy(
    await token.getAddress(), safe.address, cliffM * MONTH, linearM * MONTH, revocable, treasury.address);
  await token.transfer(await v.getAddress(), AMT * 3n);
  return { deployer, safe, treasury, ben, ben2, stranger, token, v, cliff: cliffM * MONTH, dur: linearM * MONTH };
}
const launchIn = async (v, safe, secs = 1000) => { const t = (await time.latest()) + secs; await v.connect(safe).setLaunchTime(t); return t; };

describe("GradLockedVesting", () => {
  let snap;
  beforeEach(async () => { snap = await takeSnapshot(); });
  afterEach(async () => { await snap.restore(); }); // these tests move the chain clock by years; undo it so other suites are unaffected

  for (const [name, p] of Object.entries(PROFILES)) {
    it(`${name} ${p[0]}+${p[1]}: nothing in the cliff, no lump, linear after, exact end`, async () => {
      const { v, safe, ben, token, cliff, dur } = await setup(p);
      await v.connect(safe).addBeneficiary(ben.address, AMT);
      const tol = (AMT / BigInt(dur)) * 3n;
      expect(await v.vestedAmount(ben.address)).to.equal(0n);       // before launch is set
      const t = await launchIn(v, safe);
      await time.increaseTo(t - 5);
      expect(await v.vestedAmount(ben.address)).to.equal(0n);
      await time.increaseTo(t + cliff - 10);
      expect(await v.vestedAmount(ben.address)).to.equal(0n);
      await time.increaseTo(t + cliff + 3600);
      expect(await v.vestedAmount(ben.address)).to.be.lt(AMT / 1000n);
      await time.increaseTo(t + cliff + dur / 2);
      expect(near(await v.vestedAmount(ben.address), AMT / 2n, tol)).to.equal(true);
      await time.increaseTo(t + cliff + dur + 100);
      await v.connect(ben).release();
      expect(await token.balanceOf(ben.address)).to.equal(AMT);
      await expect(v.connect(ben).release()).to.be.revertedWithCustomError(v, "NothingToRelease");
    });
  }

  it("launch time is set once, never in the past; nothing can be added after launch starts", async () => {
    const { v, safe, ben, stranger } = await setup();
    await expect(v.connect(safe).setLaunchTime((await time.latest()) - 100)).to.be.revertedWithCustomError(v, "LaunchInPast");
    await expect(v.connect(stranger).setLaunchTime((await time.latest()) + 100)).to.be.revertedWithCustomError(v, "OwnableUnauthorizedAccount");
    const t = await launchIn(v, safe, 500);
    await expect(v.connect(safe).setLaunchTime(t + 10)).to.be.revertedWithCustomError(v, "LaunchAlreadySet");
    await time.increaseTo(t + 1);
    await expect(v.connect(safe).addBeneficiary(ben.address, AMT)).to.be.revertedWithCustomError(v, "LaunchStarted");
  });

  it("cannot promise more than the contract holds, or add the same person twice, or add after locking", async () => {
    const { v, safe, ben, ben2 } = await setup();
    await expect(v.connect(safe).addBeneficiary(ben.address, AMT * 4n)).to.be.revertedWithCustomError(v, "Underfunded");
    await v.connect(safe).addBeneficiary(ben.address, AMT * 2n);
    await expect(v.connect(safe).addBeneficiary(ben.address, AMT)).to.be.revertedWithCustomError(v, "Exists");
    await expect(v.connect(safe).addBeneficiary(ben2.address, AMT * 2n)).to.be.revertedWithCustomError(v, "Underfunded");
    await v.connect(safe).lockSchedules();
    await expect(v.connect(safe).addBeneficiary(ben2.address, AMT)).to.be.revertedWithCustomError(v, "Locked");
  });

  it("sweep sends only unassigned tokens to the treasury, and only after locking", async () => {
    const { v, safe, ben, treasury, token } = await setup();
    await v.connect(safe).addBeneficiary(ben.address, AMT);
    await expect(v.connect(safe).sweepUnallocated()).to.be.revertedWithCustomError(v, "NotLocked");
    await v.connect(safe).lockSchedules();
    await v.connect(safe).sweepUnallocated();
    expect(await token.balanceOf(treasury.address)).to.equal(AMT * 2n);
    expect(await token.balanceOf(await v.getAddress())).to.equal(AMT);
  });

  it("revocable group: owner can revoke, unvested goes to treasury (not the owner), beneficiary keeps vested", async () => {
    const { v, safe, ben, treasury, token, cliff, dur } = await setup(PROFILES.team, true);
    await v.connect(safe).addBeneficiary(ben.address, AMT);
    const t = await launchIn(v, safe);
    await time.increaseTo(t + cliff + dur / 2);
    const safeBefore = await token.balanceOf(safe.address);
    await v.connect(safe).revoke(ben.address);
    const kept = await v.vestedAmount(ben.address);
    expect(near(kept, AMT / 2n, (AMT / BigInt(dur)) * 5n)).to.equal(true);
    expect(await token.balanceOf(treasury.address)).to.equal(AMT - kept);
    expect(await token.balanceOf(safe.address)).to.equal(safeBefore);        // owner gets nothing
    await time.increase(10 * 365 * 86400);
    expect(await v.vestedAmount(ben.address)).to.equal(kept);                // frozen
    await v.connect(ben).release();
    expect(await token.balanceOf(ben.address)).to.equal(kept);
    await expect(v.connect(safe).revoke(ben.address)).to.be.revertedWithCustomError(v, "AlreadyRevoked");
  });

  it("non-revocable group (investors, advisors): revoke is impossible", async () => {
    const { v, safe, ben } = await setup(PROFILES.investors, false);
    await v.connect(safe).addBeneficiary(ben.address, AMT);
    await expect(v.connect(safe).revoke(ben.address)).to.be.revertedWithCustomError(v, "NotRevocable");
  });

  it("two-step ownership, no renounce, only a beneficiary can release", async () => {
    const { v, safe, stranger, deployer } = await setup();
    await v.connect(safe).transferOwnership(stranger.address);
    expect(await v.owner()).to.equal(safe.address);                           // not yet
    await v.connect(stranger).acceptOwnership();
    expect(await v.owner()).to.equal(stranger.address);
    await expect(v.connect(stranger).renounceOwnership()).to.be.revertedWithCustomError(v, "RenounceDisabled");
    await expect(v.connect(deployer).release()).to.be.revertedWithCustomError(v, "NoSchedule");
  });

  it("deploy order: vesting can be built against a token address predicted from the deployer nonce", async () => {
    const [deployer, safe, treasury] = await ethers.getSigners();
    const nonce = await ethers.provider.getTransactionCount(deployer.address);
    const predicted = ethers.getCreateAddress({ from: deployer.address, nonce: nonce + 1 });
    const v = await (await ethers.getContractFactory("GradLockedVesting")).deploy(predicted, safe.address, 12 * MONTH, 36 * MONTH, true, treasury.address);
    const token = await (await ethers.getContractFactory("MockGRAD")).deploy();
    expect(await token.getAddress()).to.equal(predicted);
    expect(await v.grad()).to.equal(predicted);
  });
});
