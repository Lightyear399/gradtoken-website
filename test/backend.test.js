const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");
const { fakeDb } = require("./helpers/fakeDb");

const F = "../netlify/functions/";
const claimV = require(F + "claim-voucher");
const refV = require(F + "referral-voucher");
const regRef = require(F + "register-referral");
const myRef = require(F + "my-referral");
const passed = require(F + "mark-course-passed");

let chainNow = 0; // handlers read the CHAIN clock, because other suites move it by years
const call = async (handler, body, method = "POST") => {
  chainNow = (await time.latest()) + 1;
  const res = await handler({ httpMethod: method, headers: {}, body: JSON.stringify(body || {}) });
  return { status: res.statusCode, body: JSON.parse(res.body) };
};
const E = (n) => ethers.parseEther(String(n));

async function setup() {
  const [admin, minterS] = await ethers.getSigners();
  const voucherWallet = ethers.Wallet.createRandom();
  const grad = await (await ethers.getContractFactory("MockGRAD")).deploy();
  const cert = await (await ethers.getContractFactory("GradCertificate")).deploy(admin.address, minterS.address);
  const rewards = await (await ethers.getContractFactory("GradRewards")).deploy(
    await grad.getAddress(), await cert.getAddress(), admin.address, voucherWallet.address, E(3), E(1), E(2_000_000));
  await grad.transfer(await rewards.getAddress(), E(1000));
  const { chainId } = await ethers.provider.getNetwork();
  const rewardsAddress = await rewards.getAddress();

  const db = fakeDb();
  db.clock = () => chainNow * 1000; // referral qualification time follows the chain clock
  const users = {};
  const who = { current: null };
  const mkUser = (id, role) => (users[id] = { id, app_metadata: role ? { role } : {} });
  const deps = {
    db, signer: voucherWallet, now: () => chainNow,
    auth: async () => who.current,
    chain: {
      chainId: Number(chainId), rewardsAddress, minted: [],
      hasCourse: (l, c) => cert.hasCourse(l, c),
      hasCertificate: async (a) => (await cert.balanceOf(a)) > 0n,
      refereePaid: (a) => rewards.refereePaid(a),
      async mint(l, c, e) { this.minted.push([l, c]); const tx = await cert.connect(minterS).issueCourse(l, c, e); return (await tx.wait()).hash; },
    },
  };
  return { deps, db, rewards, cert, grad, mkUser, who, handlers: {
    claim: claimV.createHandler(deps), ref: refV.createHandler(deps),
    reg: regRef.createHandler(deps), my: myRef.createHandler(deps), pass: passed.createHandler(deps) } };
}

describe("backend functions", () => {
  it("issues a course voucher only after server-verified completion, and the contract accepts it", async () => {
    const t = await setup();
    const [, , learner] = await ethers.getSigners();
    const u = t.mkUser("u1"); const adm = t.mkUser("root", "admin");
    await t.db.linkWallet("u1", learner.address);
    t.who.current = u;
    expect((await call(t.handlers.claim, { courseId: "solidity-basics" })).status).to.equal(403);
    expect((await call(t.handlers.claim, { courseId: "nope" })).status).to.equal(400);
    t.who.current = u;
    expect((await call(t.handlers.pass, { userId: "u1", courseId: "solidity-basics", evidence: "x" })).status).to.equal(403);
    t.who.current = adm;
    const r = await call(t.handlers.pass, { userId: "u1", courseId: "solidity-basics", evidence: "repo@abc123" });
    expect(r.body.passed).to.equal(true);
    expect(await t.cert.hasCourse(learner.address, ethers.id("solidity-basics"))).to.equal(true);
    t.who.current = u;
    const v = (await call(t.handlers.claim, { courseId: "solidity-basics" })).body;
    await t.rewards.connect(learner).claimCourseReward(v.courseId, v.deadline, v.signature);
    expect(await t.grad.balanceOf(learner.address)).to.equal(E(3));
  });

  it("mark-course-passed is idempotent and retries a failed mint", async () => {
    const t = await setup();
    const [, , learner] = await ethers.getSigners();
    t.mkUser("u1"); const adm = t.mkUser("root", "admin");
    await t.db.linkWallet("u1", learner.address);
    t.who.current = adm;
    const realMint = t.deps.chain.mint;
    t.deps.chain.mint = async () => { throw new Error("rpc down"); };
    expect((await call(t.handlers.pass, { userId: "u1", courseId: "solidity-basics", evidence: "e" })).status).to.equal(502);
    t.deps.chain.mint = realMint;
    const ok = await call(t.handlers.pass, { userId: "u1", courseId: "solidity-basics", evidence: "e" });
    expect(ok.status).to.equal(200);
    expect(t.db.s.completions).to.have.length(1);
    const again = await call(t.handlers.pass, { userId: "u1", courseId: "solidity-basics", evidence: "e" });
    expect(again.body.certTx).to.equal(ok.body.certTx);
    expect(t.deps.chain.minted).to.have.length(1);
  });

  it("registers a referral, qualifies it on first course, and pays after the hold", async () => {
    const t = await setup();
    const [, , referrerS, refereeS] = await ethers.getSigners();
    const a = t.mkUser("ref"); const b = t.mkUser("new"); const adm = t.mkUser("root", "admin");
    await t.db.linkWallet("ref", referrerS.address); await t.db.linkWallet("new", refereeS.address);
    t.who.current = a;
    const code = (await call(t.handlers.my, {})).body.code;
    t.who.current = b;
    expect((await call(t.handlers.reg, { code })).body.registered).to.equal(true);
    expect((await call(t.handlers.reg, { code })).status).to.equal(409);
    t.who.current = a;
    expect((await call(t.handlers.reg, { code })).status).to.equal(400);

    t.who.current = adm;
    await call(t.handlers.pass, { userId: "ref", courseId: "solidity-basics", evidence: "r" });
    const q = await call(t.handlers.pass, { userId: "new", courseId: "solidity-basics", evidence: "n" });
    expect(q.body.referral).to.deep.equal({ qualified: true, flaggedForReview: false });

    t.who.current = a;
    let res = (await call(t.handlers.ref, {})).body;
    expect(res.vouchers).to.have.length(0);
    expect(res.pending).to.have.length(1);
    await time.increase(7 * 86400 + 10);
    res = (await call(t.handlers.ref, {})).body;
    expect(res.vouchers).to.have.length(1);
    const v = res.vouchers[0];
    await t.rewards.connect(referrerS).claimReferral(v.referee, v.qualifiedAt, v.deadline, v.signature);
    expect(await t.grad.balanceOf(referrerS.address)).to.equal(E(1));
    res = (await call(t.handlers.ref, {})).body;
    expect(res.vouchers).to.have.length(0);
    expect(t.db.s.referrals.get("new").status).to.equal("paid");
  });

  it("flags a referrer with more than 5 qualified referrals in 30 days", async () => {
    const t = await setup();
    const signers = await ethers.getSigners();
    t.mkUser("ref"); const adm = t.mkUser("root", "admin");
    await t.db.linkWallet("ref", signers[2].address);
    const code = await t.db.ensureCode("ref");
    let last;
    for (let i = 0; i < 6; i++) {
      const id = "kid" + i;
      t.mkUser(id);
      await t.db.linkWallet(id, ethers.Wallet.createRandom().address);
      await t.db.insertReferral(id, "ref", code);
      t.who.current = adm;
      last = (await call(t.handlers.pass, { userId: id, courseId: "solidity-basics", evidence: id })).body.referral;
    }
    expect(last.flaggedForReview).to.equal(true);
    expect((await t.db.listReferralsForReferrer("ref")).length).to.equal(5);
  });

  it("rejects non-POST methods", async () => {
    const t = await setup();
    expect((await call(t.handlers.claim, {}, "GET")).status).to.equal(405);
  });
});
