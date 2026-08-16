const { expect } = require("chai");
const { deploy, ethers, increaseTime, currentTimestamp } = require("./helpers");

const DAY = 24 * 60 * 60;
const MONTH = 30 * DAY;

describe("GradVesting", function () {
  let owner, beneficiary, other;
  let token, vesting;
  const grantAmount = ethers.parseUnits("1000000", 18); // 1,000,000 GRAD

  beforeEach(async function () {
    [owner, beneficiary, other] = await ethers.getSigners();

    // Deploy token allocating everything to `owner` for test simplicity by
    // pointing every bucket at owner, then owner funds the vesting contract.
    token = await deploy("GradToken", owner, [
      owner.address,
      owner.address,
      owner.address,
      owner.address,
      owner.address,
      owner.address,
      owner.address,
    ]);

    vesting = await deploy("GradVesting", owner, [await token.getAddress(), owner.address]);
    await token.connect(owner).transfer(await vesting.getAddress(), grantAmount * 10n);
  });

  it("releases nothing before the cliff ends", async function () {
    const start = await currentTimestamp();
    const cliff = 12 * MONTH;
    const duration = 24 * MONTH;

    await vesting.createSchedule(beneficiary.address, grantAmount, start, cliff, duration, false);

    await increaseTime(6 * MONTH);
    expect(await vesting.releasableAmount(0)).to.equal(0n);

    await expect(vesting.connect(beneficiary).release(0)).to.be.revertedWith("GradVesting: nothing to release");
  });

  it("releases proportionally during the linear vesting window (team schedule: 12mo cliff, 24mo linear)", async function () {
    const start = await currentTimestamp();
    const cliff = 12 * MONTH;
    const duration = 24 * MONTH;

    await vesting.createSchedule(beneficiary.address, grantAmount, start, cliff, duration, false);

    // Move to cliff + 12 months = halfway through the 24-month linear window.
    await increaseTime(cliff + 12 * MONTH);

    const expectedApprox = grantAmount / 2n;
    const tolerance = grantAmount / 100n; // 1%, well above the ~1-block timing drift

    const balBefore = await token.balanceOf(beneficiary.address);
    const tx = await vesting.connect(beneficiary).release(0);
    const receipt = await tx.wait();
    const balAfter = await token.balanceOf(beneficiary.address);

    const event = receipt.logs.map((l) => vesting.interface.parseLog(l)).find((e) => e && e.name === "TokensReleased");
    const releasedAmount = event.args.amount;

    // The transferred balance always matches the emitted amount exactly...
    expect(balAfter - balBefore).to.equal(releasedAmount);
    // ...and that amount is approximately half the grant, as expected at the
    // halfway point of the linear vesting window.
    expect(releasedAmount).to.be.closeTo(expectedApprox, tolerance);
  });

  it("releases the full grant once the vesting duration has fully elapsed", async function () {
    const start = await currentTimestamp();
    const cliff = 6 * MONTH;
    const duration = 18 * MONTH;

    await vesting.createSchedule(beneficiary.address, grantAmount, start, cliff, duration, false);
    await increaseTime(cliff + duration + DAY);

    await vesting.connect(beneficiary).release(0);
    expect(await token.balanceOf(beneficiary.address)).to.equal(grantAmount);

    // Nothing left to release.
    await expect(vesting.connect(beneficiary).release(0)).to.be.revertedWith("GradVesting: nothing to release");
  });

  it("lets anyone call release() but funds only ever go to the fixed beneficiary", async function () {
    const start = await currentTimestamp();
    await vesting.createSchedule(beneficiary.address, grantAmount, start, 0, MONTH, false);
    await increaseTime(MONTH + 1);

    const otherBalBefore = await token.balanceOf(other.address);
    await vesting.connect(other).release(0); // `other` pays gas, but...
    expect(await token.balanceOf(other.address)).to.equal(otherBalBefore); // ...gets nothing
    expect(await token.balanceOf(beneficiary.address)).to.equal(grantAmount);
  });

  it("only the owner can create schedules", async function () {
    const start = await currentTimestamp();
    await expect(
      vesting.connect(other).createSchedule(beneficiary.address, grantAmount, start, 0, MONTH, false)
    ).to.be.revertedWithCustomError(vesting, "OwnableUnauthorizedAccount");
  });

  it("prevents creating a schedule that would over-commit the contract's token balance", async function () {
    const start = await currentTimestamp();
    const hugeAmount = grantAmount * 1000n; // far more than the contract holds
    await expect(
      vesting.createSchedule(beneficiary.address, hugeAmount, start, 0, MONTH, true)
    ).to.be.revertedWith("GradVesting: insufficient contract balance for new schedule");
  });

  describe("revocation", function () {
    it("on a revocable schedule, sends already-vested tokens to the beneficiary and the unvested remainder back to the owner", async function () {
      const start = await currentTimestamp();
      const cliff = 12 * MONTH;
      const duration = 24 * MONTH;

      await vesting.createSchedule(beneficiary.address, grantAmount, start, cliff, duration, true);
      await increaseTime(cliff + 12 * MONTH); // halfway vested

      const ownerBalBefore = await token.balanceOf(owner.address);

      const tx = await vesting.connect(owner).revoke(0);
      const receipt = await tx.wait();
      const parsed = receipt.logs.map((l) => vesting.interface.parseLog(l)).filter(Boolean);
      const revokedEvent = parsed.find((e) => e.name === "ScheduleRevoked");
      const releasedEvent = parsed.find((e) => e.name === "TokensReleased");

      // Beneficiary got exactly the already-vested chunk (per the emitted event).
      expect(await token.balanceOf(beneficiary.address)).to.equal(releasedEvent.args.amount);

      // Owner got back exactly the unvested remainder (per the emitted event),
      // which should be roughly the other half of the grant.
      const ownerBalAfter = await token.balanceOf(owner.address);
      expect(ownerBalAfter - ownerBalBefore).to.equal(revokedEvent.args.unvestedReturned);
      expect(revokedEvent.args.unvestedReturned).to.be.closeTo(grantAmount / 2n, grantAmount / 100n);

      // Nothing further can ever be released on a revoked schedule.
      await increaseTime(24 * MONTH);
      await expect(vesting.connect(beneficiary).release(0)).to.be.revertedWith("GradVesting: nothing to release");
    });

    it("cannot revoke a schedule that was created as non-revocable", async function () {
      const start = await currentTimestamp();
      await vesting.createSchedule(beneficiary.address, grantAmount, start, 0, MONTH, false);
      await expect(vesting.connect(owner).revoke(0)).to.be.revertedWith("GradVesting: not revocable");
    });

    it("only the owner can revoke", async function () {
      const start = await currentTimestamp();
      await vesting.createSchedule(beneficiary.address, grantAmount, start, 0, MONTH, true);
      await expect(vesting.connect(other).revoke(0)).to.be.revertedWithCustomError(
        vesting,
        "OwnableUnauthorizedAccount"
      );
    });

    it("cannot revoke the same schedule twice", async function () {
      const start = await currentTimestamp();
      await vesting.createSchedule(beneficiary.address, grantAmount, start, 0, MONTH, true);
      await vesting.connect(owner).revoke(0);
      await expect(vesting.connect(owner).revoke(0)).to.be.revertedWith("GradVesting: already revoked");
    });
  });
});
