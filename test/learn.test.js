const { expect } = require("chai");
const { ethers } = require("hardhat");
const A = require("../learn/abi");
const { fakeDb } = require("./helpers/fakeDb");
const status = require("../netlify/functions/my-status");

describe("learner rewards page", () => {
  const rewardsIface = new ethers.Interface([
    "function claimCourseReward(bytes32 courseId, uint256 deadline, bytes signature)",
    "function claimReferral(address referee, uint256 qualifiedAt, uint256 deadline, bytes signature)",
    "function courseClaimed(address, bytes32) view returns (bool)",
    "function balanceOf(address) view returns (uint256)",
    "error AlreadyClaimed()", "error Expired()", "error BadSignature()", "error CapExceeded()", "error HoldActive()",
    "error NoCertificate()", "error SelfReferral()", "error ReferralLimit()", "error EnforcedPause()",
  ]);
  const sig65 = "0x" + "ab".repeat(65);
  const who = "0x" + "12".repeat(20), id = ethers.id("solidity-basics");

  it("browser ABI encoding matches ethers byte for byte", () => {
    expect(A.encodeClaimCourse(id, 1893456000, sig65)).to.equal(rewardsIface.encodeFunctionData("claimCourseReward", [id, 1893456000, sig65]));
    expect(A.encodeClaimReferral(who, 1700000000, 1893456000, sig65)).to.equal(rewardsIface.encodeFunctionData("claimReferral", [who, 1700000000, 1893456000, sig65]));
    expect(A.encodeCourseClaimed(who, id)).to.equal(rewardsIface.encodeFunctionData("courseClaimed", [who, id]));
    expect(A.encodeBalanceOf(who)).to.equal(rewardsIface.encodeFunctionData("balanceOf", [who]));
  });

  it("error selectors map to messages and amounts format", () => {
    for (const name of ["AlreadyClaimed", "Expired", "BadSignature", "CapExceeded", "HoldActive", "NoCertificate", "SelfReferral", "ReferralLimit", "EnforcedPause"]) {
      expect(A.ERRORS[rewardsIface.getError(name).selector], name).to.be.a("string");
    }
    expect(A.friendlyError({ data: rewardsIface.getError("HoldActive").selector })).to.contain("7 days");
    expect(A.friendlyError({ code: 4001 })).to.contain("cancelled");
    expect(A.formatUnits("0x" + (3n * 10n ** 18n + 5n * 10n ** 17n).toString(16))).to.equal("3.50");
  });

  it("my-status lists every course with passed and certified flags", async () => {
    const db = fakeDb();
    await db.linkWallet("u", who);
    await db.insertCompletion("u", "solidity-basics", "0x1", "root");
    await db.setCertTx("u", "solidity-basics", "0xabc");
    await db.insertCompletion("u", "data-analytics", "0x2", "root");
    const h = status.createHandler({ db, auth: async () => ({ id: "u", app_metadata: {} }) });
    const res = JSON.parse((await h({ httpMethod: "POST", headers: {}, body: "{}" })).body);
    expect(res.wallet).to.equal(who);
    const by = Object.fromEntries(res.courses.map((c) => [c.course, c]));
    expect(by["solidity-basics"]).to.include({ passed: true, certified: true, courseId: id });
    expect(by["data-analytics"]).to.include({ passed: true, certified: false });
    expect(by["intro-to-blockchain"]).to.include({ passed: false, certified: false });
  });
});
