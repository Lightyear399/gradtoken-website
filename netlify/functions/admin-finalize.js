// ADMIN. POST {userId, courseId}. Refuses unless every required component has passed, then records the
// completion, mints the certificate record and qualifies any referral.
const { HttpError, parseBody, run } = require("./_lib/http");
const { requireAdmin, requireCourse } = require("./_lib/admin");
const { checklist } = require("./_lib/review");
const { finalizeCourse } = require("./_lib/finalize");

const createHandler = (deps) => (event) => run(event, async () => {
  const admin = await requireAdmin(deps, event);
  const b = parseBody(event);
  const course = requireCourse(b.courseId);
  const userId = String(b.userId || "");
  if (!userId) throw new HttpError(400, "userId required");

  const list = await checklist(deps.db, userId, course);
  if (!list.ready) throw new HttpError(409, "Not every component has passed yet");

  const capstone = await deps.db.latestApprovedSubmission(userId, course, "capstone");
  const evidence = capstone
    ? `${course}|submission:${capstone.id}|${capstone.repo_url || ""}`
    : `${course}|reviewed-by:${admin.id}`;
  return finalizeCourse(deps, admin.id, userId, course, evidence);
});

exports.createHandler = createHandler;
exports.handler = (event) => createHandler(require("./_lib/deps").realDeps())(event);
