const { expect } = require("chai");
const { deploy, ethers, increaseTime } = require("./helpers");

const DAY = 24 * 60 * 60;

describe("GradStaking", function () {
  let owner, alice, bob, other;
  let token, staking;

  beforeEach(async function () {
    [owner, alice, bob, other] = await ethers.getSigners();

    token = await deploy("GradToken", owner, [
      owner.address,
      owner.address,
      owner.address,
      owner.address,
      owner.address,
      owner.address,
      owner.address,
    ]);

    staking = await deploy("GradStaking", owner, [await token.getAddress(), owner.address]);

    // Distribute some GRAD to stakers and fund the staking contract's reward pool.
    await token.transfer(alice.address, ethers.parseUnits("10000", 18));
    await token.transfer(bob.address, ethers.parseUnits("10000", 18));
    await token.transfer(await staking.getAddress(), ethers.parseUnits("1000000", 18)); // reward funding
  });

  it("lets a user stake and withdraw their exact principal once the minimum stake duration has passed", async function () {
    const amount = ethers.parseUnits("100", 18);
    await token.connect(alice).approve(await staking.getAddress(), amount);
    await staking.connect(alice).stake(amount);

    expect(await staking.balanceOf(alice.address)).to.equal(amount);
    expect(await staking.totalStaked()).to.equal(amount);

    // withdraw() is gated by minStakeDuration (anti-sniping) — see
    // Security.exploit.test.js for why. emergencyWithdraw() is the instant,
    // reward-forfeiting path if you need principal back sooner.
    await increaseTime(3600 + 1);
    await staking.connect(alice).withdraw(amount);
    expect(await staking.balanceOf(alice.address)).to.equal(0n);
  });

  it("rejects staking below the minimum amount, staking zero, and withdrawing more than staked", async function () {
    await expect(staking.connect(alice).stake(0)).to.be.revertedWith("GradStaking: amount below minimum stake");
    await expect(staking.connect(alice).stake(1)).to.be.revertedWith("GradStaking: amount below minimum stake");
    await expect(staking.connect(alice).withdraw(1)).to.be.revertedWith("GradStaking: insufficient balance");
  });

  it("blocks withdrawing before the minimum stake duration has elapsed, but emergencyWithdraw still works instantly", async function () {
    const amount = ethers.parseUnits("100", 18);
    await token.connect(alice).approve(await staking.getAddress(), amount);
    await staking.connect(alice).stake(amount);

    await expect(staking.connect(alice).withdraw(amount)).to.be.revertedWith(
      "GradStaking: position must be held for the minimum stake duration; use emergencyWithdraw() to exit early and forfeit rewards"
    );

    await expect(staking.connect(alice).emergencyWithdraw()).to.not.be.reverted;
    expect(await staking.balanceOf(alice.address)).to.equal(0n);
  });

  it("accrues rewards proportional to stake share over time", async function () {
    const rewardAmount = ethers.parseUnits("864000", 18); // 10/sec over 30 days for easy math
    await staking.connect(owner).notifyRewardAmount(rewardAmount);

    const amount = ethers.parseUnits("100", 18);
    await token.connect(alice).approve(await staking.getAddress(), amount);
    await staking.connect(alice).stake(amount);

    await increaseTime(DAY);

    const earned = await staking.earned(alice.address);
    // ~10 tokens/sec * 86400s = 864000, alice owns 100% of the pool.
    expect(earned).to.be.closeTo(ethers.parseUnits("864000", 18) / 30n, ethers.parseUnits("100", 18));
  });

  it("splits rewards between two stakers proportional to their share", async function () {
    const rewardAmount = ethers.parseUnits("864000", 18);
    await staking.connect(owner).notifyRewardAmount(rewardAmount);

    const amount = ethers.parseUnits("100", 18);
    await token.connect(alice).approve(await staking.getAddress(), amount);
    await staking.connect(alice).stake(amount);
    await token.connect(bob).approve(await staking.getAddress(), amount * 3n);
    await staking.connect(bob).stake(amount * 3n); // bob has 3x alice's stake

    await increaseTime(DAY);

    const aliceEarned = await staking.earned(alice.address);
    const bobEarned = await staking.earned(bob.address);

    // bob should have ~3x alice's rewards (allow tolerance for the block where
    // only alice was staked before bob joined).
    expect(bobEarned).to.be.closeTo(aliceEarned * 3n, ethers.parseUnits("50", 18));
  });

  it("notifyRewardAmount reverts if the contract doesn't actually hold enough GRAD to cover it (solvency check)", async function () {
    const tooMuch = ethers.parseUnits("50000000", 18); // far more than the 1,000,000 funded
    await expect(staking.connect(owner).notifyRewardAmount(tooMuch)).to.be.revertedWith(
      "GradStaking: reward too high for balance"
    );
  });

  it("only the owner can call notifyRewardAmount, pause, unpause, and recoverERC20", async function () {
    await expect(staking.connect(other).notifyRewardAmount(1)).to.be.revertedWithCustomError(
      staking,
      "OwnableUnauthorizedAccount"
    );
    await expect(staking.connect(other).pause()).to.be.revertedWithCustomError(staking, "OwnableUnauthorizedAccount");
    await expect(staking.connect(other).recoverERC20(await token.getAddress(), 1)).to.be.revertedWithCustomError(
      staking,
      "OwnableUnauthorizedAccount"
    );
  });

  it("recoverERC20 refuses to ever move the GRAD staking/reward token itself", async function () {
    await expect(staking.connect(owner).recoverERC20(await token.getAddress(), 1)).to.be.revertedWith(
      "GradStaking: cannot withdraw staking/reward token"
    );
  });

  it("pausing blocks new stakes and reward claims, but principal withdrawal always stays available", async function () {
    const rewardAmount = ethers.parseUnits("864000", 18);
    await staking.connect(owner).notifyRewardAmount(rewardAmount);

    const amount = ethers.parseUnits("100", 18);
    await token.connect(alice).approve(await staking.getAddress(), amount);
    await staking.connect(alice).stake(amount);
    await increaseTime(DAY);

    await staking.connect(owner).pause();

    // Blocked while paused:
    await expect(staking.connect(alice).stake(1)).to.be.revertedWithCustomError(staking, "EnforcedPause");
    await expect(staking.connect(alice).getReward()).to.be.revertedWithCustomError(staking, "EnforcedPause");

    // Never blocked, even while paused — user principal is never trapped:
    await expect(staking.connect(alice).withdraw(amount)).to.not.be.reverted;
  });

  it("emergencyWithdraw returns principal and forfeits rewards, and works even while paused", async function () {
    const rewardAmount = ethers.parseUnits("864000", 18);
    await staking.connect(owner).notifyRewardAmount(rewardAmount);

    const amount = ethers.parseUnits("100", 18);
    await token.connect(alice).approve(await staking.getAddress(), amount);
    await staking.connect(alice).stake(amount);
    await increaseTime(DAY);

    await staking.connect(owner).pause();

    const balBefore = await token.balanceOf(alice.address);
    await staking.connect(alice).emergencyWithdraw();
    const balAfter = await token.balanceOf(alice.address);

    expect(balAfter - balBefore).to.equal(amount);
    expect(await staking.balanceOf(alice.address)).to.equal(0n);
    // Forfeited reward accounting is zeroed, not paid out later.
    expect(await staking.earned(alice.address)).to.equal(0n);
  });

  it("exit() withdraws principal and claims rewards in one call", async function () {
    const rewardAmount = ethers.parseUnits("864000", 18);
    await staking.connect(owner).notifyRewardAmount(rewardAmount);

    const amount = ethers.parseUnits("100", 18);
    await token.connect(alice).approve(await staking.getAddress(), amount);
    await staking.connect(alice).stake(amount);
    await increaseTime(DAY);

    const balBefore = await token.balanceOf(alice.address);
    await staking.connect(alice).exit();
    const balAfter = await token.balanceOf(alice.address);

    expect(await staking.balanceOf(alice.address)).to.equal(0n);
    expect(balAfter - balBefore).to.be.greaterThan(amount); // got principal + some reward
  });
});
