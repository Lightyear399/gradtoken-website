// Shared by mark-course-passed and admin-finalize: record the completion, mint the certificate
// record, and qualify the learner's referral on their first verified course. Safe to call again.
const { ethers } = require("ethers");
const { HttpError } = require("./http");
const { FLAG_MAX_QUALIFIED_PER_30D } = require("./config");

async function finalizeCourse(deps, adminId, userId, course, evidence) {
  const wallet = await deps.db.getWallet(userId);
  if (!wallet) throw new HttpError(409, "Learner has not linked a wallet");

  let completion = await deps.db.getCompletion(userId, course);
  if (completion && completion.status !== "passed") throw new HttpError(409, "Completion was revoked");
  if (!completion) completion = await deps.db.insertCompletion(userId, course, ethers.id(evidence), adminId);

  let certTx = completion.cert_tx;
  if (!certTx) {
    const courseHash = ethers.id(course);
    try {
      certTx = (await deps.chain.hasCourse(wallet, courseHash))
        ? "already-on-chain"
        : await deps.chain.mint(wallet, courseHash, completion.evidence_hash);
    } catch (e) {
      console.error("mint failed", e);
      throw new HttpError(502, "Course recorded but certificate mint failed. Call again to retry.");
    }
    await deps.db.setCertTx(userId, course, certTx);
  }

  let referral = null;
  if ((await deps.db.countCompletions(userId)) === 1) {
    const ref = await deps.db.getReferralByReferee(userId);
    if (ref && ref.status === "registered") {
      const since = new Date((deps.now() - 30 * 24 * 3600) * 1000).toISOString();
      const recent = await deps.db.countQualifiedSince(ref.referrer_id, since);
      const flagged = recent + 1 > FLAG_MAX_QUALIFIED_PER_30D;
      await deps.db.qualifyReferral(userId, flagged);
      referral = { qualified: true, flaggedForReview: flagged };
    }
  }
  return { passed: true, course, certTx, referral };
}
module.exports = { finalizeCourse };
