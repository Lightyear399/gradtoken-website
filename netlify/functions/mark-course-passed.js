// ADMIN ONLY override path. POST {userId, courseId, evidence}. Normal flow is admin-finalize, which
// refuses to run until every component has passed. Use this only for special cases.
// `evidence` is any string identifying the reviewed work (repo URL + commit, submission id).
const { HttpError, parseBody, run } = require("./_lib/http");
const { COURSES } = require("./_lib/config");
const { finalizeCourse } = require("./_lib/finalize");

const createHandler = (deps) => (event) => run(event, async () => {
  const admin = await deps.auth(event);
  if (admin.app_metadata?.role !== "admin") throw new HttpError(403, "Admin only");
  const b = parseBody(event);
  const userId = String(b.userId || "");
  const course = String(b.courseId || "");
  const evidence = String(b.evidence || "").trim();
  if (!userId || !evidence) throw new HttpError(400, "userId and evidence are required");
  if (!COURSES[course]) throw new HttpError(400, "Unknown course");
  return finalizeCourse(deps, admin.id, userId, course, evidence);
});

exports.createHandler = createHandler;
exports.handler = (event) => createHandler(require("./_lib/deps").realDeps())(event);
