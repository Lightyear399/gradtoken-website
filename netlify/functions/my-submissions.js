// LEARNER. POST {} -> the caller's submissions with status and reviewer feedback.
const { run } = require("./_lib/http");
const createHandler = (deps) => (event) => run(event, async () => {
  const user = await deps.auth(event);
  return { submissions: await deps.db.listSubmissionsForUser(user.id) };
});
exports.createHandler = createHandler;
exports.handler = (event) => createHandler(require("./_lib/deps").realDeps())(event);
