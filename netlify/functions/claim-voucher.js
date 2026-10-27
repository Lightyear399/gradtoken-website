// POST {courseId:"solidity-basics"} -> signed voucher for GradRewards.claimCourseReward
// Only issued when the server has recorded the course as passed (exam + capstone verified).
const { ethers } = require("ethers");
const { HttpError, parseBody, run } = require("./_lib/http");
const { COURSES, VOUCHER_TTL_SECONDS } = require("./_lib/config");
const { signCourse } = require("./_lib/vouchers");

const createHandler = (deps) => (event) => run(event, async () => {
  const user = await deps.auth(event);
  const course = String(parseBody(event).courseId || "");
  if (!COURSES[course]) throw new HttpError(400, "Unknown course");

  const wallet = await deps.db.getWallet(user.id);
  if (!wallet) throw new HttpError(409, "Link a wallet first");
  const completion = await deps.db.getCompletion(user.id, course);
  if (!completion || completion.status !== "passed") throw new HttpError(403, "Course not completed and verified");

  const courseId = ethers.id(course);
  const deadline = deps.now() + VOUCHER_TTL_SECONDS;
  const signature = await signCourse(
    deps.signer, { chainId: deps.chain.chainId, verifyingContract: deps.chain.rewardsAddress }, wallet, courseId, deadline);
  return { course, courseId, deadline, signature, wallet, rewards: deps.chain.rewardsAddress, chainId: deps.chain.chainId };
});

exports.createHandler = createHandler;
exports.handler = (event) => createHandler(require("./_lib/deps").realDeps())(event);
