const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time, loadFixture } = require("@nomicfoundation/hardhat-network-helpers");

const E = (n) => ethers.parseEther(String(n));
const DAY = 86400;
const COURSE = ethers.id("solidity-basics");

async function deployWith(cap) {
  const [admin, signer, alice, bob, carol, stranger] = await ethers.getSigners();
  const grad = await (await ethers.getContractFactory("MockGRAD")).deploy();
  const cert = await (await ethers.getContractFactory("MockCertificate")).deploy();
  const rewards = await (await ethers.getContractFactory("GradRewards")).deploy(
    await grad.getAddress(), await cert.getAddress(), admin.address, signer.address, E(3), E(1), cap);
  await grad.transfer(await rewards.getAddress(), E(300_000_000));
  const { chainId } = await ethers.provider.getNetwork();
  const domain = { name: "GradRewards", version: "1", chainId, verifyingContract: await rewards.getAddress() };
  const signCourse = (learner, courseId, deadline, s = signer) =>
    s.signTypedData(domain,
      { CourseClaim: [{ name: "learner", type: "address" }, { name: "courseId", type: "bytes32" }, { name: "deadline", type: "uint256" }] },
      { learner, courseId, deadline });
  const signReferral = (referrer, referee, qualifiedAt, deadline, s = signer) =>
    s.signTypedData(domain,
      { ReferralClaim: [{ name: "referrer", type: "address" }, { name: "referee", type: "address" }, { name: "qualifiedAt", type: "uint256" }, { name: "deadline", type: "uint256" }] },
      { referrer, referee, qualifiedAt, deadline });
  return { admin, signer, alice, bob, carol, stranger, grad, cert, rewards, signCourse, signReferral };
}
const fixture = () => deployWith(E(2_000_000));
const dl = async () => (await time.latest()) + 3600;

describe("GradRewards", () => {
  it("pays the fixed course reward once", async () => {
    const { rewards, grad, alice, signCourse } = await loadFixture(fixture);
    const d = await dl();
    const sig = await signCourse(alice.address, COURSE, d);
    await expect(rewards.connect(alice).claimCourseReward(COURSE, d, sig))
      .to.emit(rewards, "CourseRewardClaimed").withArgs(alice.address, COURSE, E(3));
    expect(await grad.balanceOf(alice.address)).to.equal(E(3));
    await expect(rewards.connect(alice).claimCourseReward(COURSE, d, sig))
      .to.be.revertedWithCustomError(rewards, "AlreadyClaimed");
  });

  it("rejects wrong signer, wrong claimer and expired vouchers", async () => {
    const { rewards, alice, bob, stranger, signCourse } = await loadFixture(fixture);
    const d = await dl();
    const bad = await signCourse(alice.address, COURSE, d, stranger);
    await expect(rewards.connect(alice).claimCourseReward(COURSE, d, bad))
      .to.be.revertedWithCustomError(rewards, "BadSignature");
    const good = await signCourse(alice.address, COURSE, d);
    await expect(rewards.connect(bob).claimCourseReward(COURSE, d, good))
      .to.be.revertedWithCustomError(rewards, "BadSignature");
    await time.increase(7200);
    await expect(rewards.connect(alice).claimCourseReward(COURSE, d, good))
      .to.be.revertedWithCustomError(rewards, "Expired");
  });

  it("enforces the annual cap and resets next epoch", async () => {
    const { rewards, alice, bob, signCourse } = await deployWith(E(4));
    let d = await dl();
    await rewards.connect(alice).claimCourseReward(COURSE, d, await signCourse(alice.address, COURSE, d));
    await expect(rewards.connect(bob).claimCourseReward(COURSE, d, await signCourse(bob.address, COURSE, d)))
      .to.be.revertedWithCustomError(rewards, "CapExceeded");
    await time.increase(365 * DAY);
    d = await dl();
    await rewards.connect(bob).claimCourseReward(COURSE, d, await signCourse(bob.address, COURSE, d));
  });

  it("pays a referral only after the hold, with a certificate, once per referee", async () => {
    const { rewards, grad, cert, alice, bob, signReferral } = await loadFixture(fixture);
    const q = await time.latest();
    const d = q + 30 * DAY;
    const sig = await signReferral(alice.address, bob.address, q, d);
    await expect(rewards.connect(alice).claimReferral(bob.address, q, d, sig))
      .to.be.revertedWithCustomError(rewards, "HoldActive");
    await time.increase(7 * DAY);
    await expect(rewards.connect(alice).claimReferral(bob.address, q, d, sig))
      .to.be.revertedWithCustomError(rewards, "NoCertificate");
    await cert.mint(alice.address);
    await expect(rewards.connect(alice).claimReferral(bob.address, q, d, sig))
      .to.emit(rewards, "ReferralRewardClaimed").withArgs(alice.address, bob.address, E(1));
    expect(await grad.balanceOf(alice.address)).to.equal(E(1));
    await expect(rewards.connect(alice).claimReferral(bob.address, q, d, sig))
      .to.be.revertedWithCustomError(rewards, "AlreadyClaimed");
  });

  it("blocks self-referral and caps referrals at 20 per year", async () => {
    const { rewards, cert, alice, signReferral } = await loadFixture(fixture);
    await cert.mint(alice.address);
    const q = await time.latest();
    const d = q + 60 * DAY;
    await time.increase(7 * DAY);
    await expect(rewards.connect(alice).claimReferral(alice.address, q, d, "0x"))
      .to.be.revertedWithCustomError(rewards, "SelfReferral");
    for (let i = 0; i < 20; i++) {
      const ref = ethers.Wallet.createRandom().address;
      await rewards.connect(alice).claimReferral(ref, q, d, await signReferral(alice.address, ref, q, d));
    }
    const extra = ethers.Wallet.createRandom().address;
    await expect(rewards.connect(alice).claimReferral(extra, q, d, await signReferral(alice.address, extra, q, d)))
      .to.be.revertedWithCustomError(rewards, "ReferralLimit");
  });

  it("admin controls: pause, amounts, GRAD cannot be recovered", async () => {
    const { rewards, grad, admin, alice, stranger, signCourse } = await loadFixture(fixture);
    await expect(rewards.connect(stranger).pause()).to.be.reverted;
    await rewards.connect(admin).pause();
    const d = await dl();
    await expect(rewards.connect(alice).claimCourseReward(COURSE, d, await signCourse(alice.address, COURSE, d)))
      .to.be.revertedWithCustomError(rewards, "EnforcedPause");
    await rewards.connect(admin).unpause();
    await expect(rewards.connect(admin).setRewards(E(3), E(4)))
      .to.be.revertedWithCustomError(rewards, "InvalidAmounts");
    await expect(rewards.connect(admin).recoverERC20(await grad.getAddress(), admin.address, 1))
      .to.be.revertedWithCustomError(rewards, "CannotRecoverGrad");
  });
});
