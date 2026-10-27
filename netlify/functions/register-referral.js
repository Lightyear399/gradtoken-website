// POST {code} -> locks the referral for this account. Must happen before the first completed course.
const { HttpError, parseBody, run } = require("./_lib/http");

const createHandler = (deps) => (event) => run(event, async () => {
  const user = await deps.auth(event);
  const code = String(parseBody(event).code || "").trim().toUpperCase();
  if (!/^[A-Z0-9]{6,12}$/.test(code)) throw new HttpError(400, "Invalid code");

  if (await deps.db.getReferralByReferee(user.id)) throw new HttpError(409, "Referral already set");
  if ((await deps.db.countCompletions(user.id)) > 0) throw new HttpError(409, "Referral must be set before your first course");
  const referrerId = await deps.db.findUserByCode(code);
  if (!referrerId) throw new HttpError(404, "Code not found");
  if (referrerId === user.id) throw new HttpError(400, "You cannot refer yourself");

  await deps.db.insertReferral(user.id, referrerId, code);
  return { registered: true };
});

exports.createHandler = createHandler;
exports.handler = (event) => createHandler(require("./_lib/deps").realDeps())(event);
