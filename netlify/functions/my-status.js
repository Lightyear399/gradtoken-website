// LEARNER. POST {} -> linked wallet and the state of every course (for the rewards page).
const { ethers } = require("ethers");
const { run } = require("./_lib/http");
const { COURSES } = require("./_lib/config");

const createHandler = (deps) => (event) => run(event, async () => {
  const user = await deps.auth(event);
  const wallet = await deps.db.getWallet(user.id);
  const rows = await deps.db.listCompletions(user.id);
  const by = Object.fromEntries(rows.map((r) => [r.course_id, r]));
  const courses = Object.entries(COURSES).map(([course, title]) => ({
    course, title, courseId: ethers.id(course),
    passed: by[course]?.status === "passed",
    certified: !!(by[course]?.status === "passed" && by[course]?.cert_tx),
  }));
  return { wallet, courses };
});
exports.createHandler = createHandler;
exports.handler = (event) => createHandler(require("./_lib/deps").realDeps())(event);
