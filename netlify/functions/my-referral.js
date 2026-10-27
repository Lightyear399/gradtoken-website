// POST {} -> the caller's referral code and counts.
const { run } = require("./_lib/http");

const createHandler = (deps) => (event) => run(event, async () => {
  const user = await deps.auth(event);
  return { code: await deps.db.ensureCode(user.id), stats: await deps.db.referralStats(user.id) };
});

exports.createHandler = createHandler;
exports.handler = (event) => createHandler(require("./_lib/deps").realDeps())(event);
