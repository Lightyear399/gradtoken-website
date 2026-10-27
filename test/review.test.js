const { expect } = require("chai");
const { ethers } = require("hardhat");
const { fakeDb } = require("./helpers/fakeDb");

const F = "../netlify/functions/";
const H = (n) => require(F + n).createHandler;

const call = async (handler, body, headers = {}) => {
  const res = await handler({ httpMethod: "POST", headers, body: JSON.stringify(body || {}) });
  return { status: res.statusCode, body: JSON.parse(res.body) };
};

async function setup() {
  const [admin, minterS, learnerS] = await ethers.getSigners();
  const cert = await (await ethers.getContractFactory("GradCertificate")).deploy(admin.address, minterS.address);
  const db = fakeDb();
  const who = { current: null };
  const deps = {
    db, internalSecret: "s3cret-value", now: () => Math.floor(Date.now() / 1000),
    auth: async () => who.current,
    chain: {
      hasCourse: (l, c) => cert.hasCourse(l, c),
      async mint(l, c, e) { return (await (await cert.connect(minterS).issueCourse(l, c, e)).wait()).hash; },
    },
  };
  const names = ["submit-work", "my-submissions", "record-component", "admin-queue", "admin-course-status",
    "admin-review", "admin-set-component", "admin-finalize", "register-referral", "my-referral"];
  const hd = Object.fromEntries(names.map((n) => [n, H(n)(deps)]));
  const learner = { id: "learner", app_metadata: {} };
  const root = { id: "root", app_metadata: { role: "admin" } };
  await db.linkWallet("learner", learnerS.address);
  return { db, who, hd, cert, learner, root, learnerS, deps };
}
const GOOD = { deployed: 5, tests: 5, security: 5, original: 5 };
const WORK = "Deployed SimpleVault to Sepolia, tests included, verified on Etherscan.";

describe("review flow", () => {
  it("validates learner submissions and blocks duplicates", async () => {
    const t = await setup(); t.who.current = t.learner;
    const s = (over) => call(t.hd["submit-work"], { courseId: "solidity-basics", component: "capstone", content: WORK, ...over });
    expect((await s({ courseId: "nope" })).status).to.equal(400);
    expect((await s({ component: "quizzes" })).status).to.equal(400);
    expect((await s({ content: "short" })).status).to.equal(400);
    expect((await s({ repoUrl: "http://insecure.example/x" })).status).to.equal(400);
    expect((await s({ repoUrl: "javascript:alert(1)" })).status).to.equal(400);
    expect((await s({ repoUrl: "https://github.com/a/b" })).body.submitted).to.equal(true);
    expect((await s({})).status).to.equal(409);
    const mine = (await call(t.hd["my-submissions"], {})).body.submissions;
    expect(mine).to.have.length(1);
  });

  it("only the internal secret can record auto components", async () => {
    const t = await setup();
    const body = { userId: "learner", courseId: "solidity-basics", component: "quizzes", passed: true, score: 90 };
    expect((await call(t.hd["record-component"], body, { "x-internal-secret": "wrong" })).status).to.equal(401);
    expect((await call(t.hd["record-component"], body)).status).to.equal(401);
    expect((await call(t.hd["record-component"], { ...body, component: "capstone" }, { "x-internal-secret": "s3cret-value" })).status).to.equal(400);
    expect((await call(t.hd["record-component"], body, { "x-internal-secret": "s3cret-value" })).body.recorded).to.equal(true);
  });

  it("enforces the rubric server-side", async () => {
    const t = await setup();
    t.who.current = t.learner;
    await call(t.hd["submit-work"], { courseId: "solidity-basics", component: "capstone", content: WORK });
    const review = (over) => call(t.hd["admin-review"], { submissionId: 1, decision: "approve", scores: GOOD, feedback: "", ...over });

    expect((await review({})).status).to.equal(403); // learner is not admin
    t.who.current = t.root;
    expect((await review({ scores: { ...GOOD, tests: 9 } })).status).to.equal(400);        // out of range
    expect((await review({ scores: { deployed: 1, tests: 1, security: 2, original: 3 } })).status).to.equal(400); // below pass mark
    expect((await review({ scores: { ...GOOD, original: 2 } })).status).to.equal(400);      // gate criterion
    expect((await review({ decision: "reject" })).status).to.equal(400);                     // feedback required
    const ok = await review({});
    expect(ok.body.status).to.equal("approved");
    expect(ok.body.checklist.items.find((i) => i.component === "capstone").passed).to.equal(true);
    expect((await review({})).status).to.equal(409);                                          // already reviewed
  });

  it("resubmission: a learner can resubmit after a resubmit request", async () => {
    const t = await setup();
    t.who.current = t.learner;
    const submit = () => call(t.hd["submit-work"], { courseId: "solidity-basics", component: "capstone", content: WORK });
    await submit();
    t.who.current = t.root;
    const r = await call(t.hd["admin-review"], { submissionId: 1, decision: "resubmit", scores: { deployed: 2, tests: 1, security: 2, original: 4 }, feedback: "Add tests and verify the contract." });
    expect(r.body.status).to.equal("resubmit");
    t.who.current = t.learner;
    expect((await submit()).body.submitted).to.equal(true);
    expect(t.db.s.submissions).to.have.length(2);
  });

  it("finalize refuses until every component passes, then mints the certificate", async () => {
    const t = await setup();
    const fin = () => call(t.hd["admin-finalize"], { userId: "learner", courseId: "solidity-basics" });
    t.who.current = t.root;
    expect((await fin()).status).to.equal(409);

    const secret = { "x-internal-secret": "s3cret-value" };
    for (const component of ["quizzes", "exam"]) {
      await call(t.hd["record-component"], { userId: "learner", courseId: "solidity-basics", component, passed: true }, secret);
    }
    t.who.current = t.learner;
    for (const component of ["exam_free_response", "capstone"]) {
      await call(t.hd["submit-work"], { courseId: "solidity-basics", component, content: WORK, repoUrl: "https://github.com/a/b" });
    }
    t.who.current = t.root;
    expect((await fin()).status).to.equal(409); // manual parts still pending

    await call(t.hd["admin-review"], { submissionId: 1, decision: "approve", scores: { accuracy: 4, reasoning: 4 }, feedback: "" });
    await call(t.hd["admin-review"], { submissionId: 2, decision: "approve", scores: GOOD, feedback: "" });
    const status = (await call(t.hd["admin-course-status"], { userId: "learner", courseId: "solidity-basics" })).body;
    expect(status.ready).to.equal(true);

    const r = await fin();
    expect(r.status).to.equal(200);
    expect(await t.cert.hasCourse(t.learnerS.address, ethers.id("solidity-basics"))).to.equal(true);
    const done = (await call(t.hd["admin-course-status"], { userId: "learner", courseId: "solidity-basics" })).body;
    expect(done.finalized).to.equal(true);
    const again = await fin();
    expect(again.body.certTx).to.equal(r.body.certTx); // idempotent
  });

  it("manual override for auto components needs an admin and a note", async () => {
    const t = await setup();
    const set = (o) => call(t.hd["admin-set-component"], { userId: "learner", courseId: "data-analytics", component: "quizzes", note: "Verified from the old exam table", ...o });
    t.who.current = t.learner;
    expect((await set({})).status).to.equal(403);
    t.who.current = t.root;
    expect((await set({ note: "ok" })).status).to.equal(400);
    expect((await set({ component: "capstone" })).status).to.equal(400);
    const r = await set({});
    expect(r.body.items.find((i) => i.component === "quizzes").source).to.equal("admin");
  });

  it("queue returns rubric, email and respects filters", async () => {
    const t = await setup();
    t.who.current = t.learner;
    await call(t.hd["submit-work"], { courseId: "data-analytics", component: "capstone", content: WORK });
    t.who.current = t.root;
    const q = (await call(t.hd["admin-queue"], {})).body;
    expect(q.items).to.have.length(1);
    expect(q.items[0].email).to.equal("learner@test.dev");
    expect(q.items[0].rubric.criteria.length).to.equal(4);
    expect((await call(t.hd["admin-queue"], { courseId: "solidity-basics" })).body.items).to.have.length(0);
    expect((await call(t.hd["admin-queue"], { status: "bogus" })).status).to.equal(400);
    t.who.current = t.learner;
    expect((await call(t.hd["admin-queue"], {})).status).to.equal(403);
  });
});
