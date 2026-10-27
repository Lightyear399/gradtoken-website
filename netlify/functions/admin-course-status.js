// ADMIN. POST {userId, courseId} -> component checklist for a learner's course.
const { HttpError, parseBody, run } = require("./_lib/http");
const { requireAdmin, requireCourse } = require("./_lib/admin");
const { checklist } = require("./_lib/review");

const createHandler = (deps) => (event) => run(event, async () => {
  await requireAdmin(deps, event);
  const b = parseBody(event);
  if (!b.userId) throw new HttpError(400, "userId required");
  return checklist(deps.db, String(b.userId), requireCourse(b.courseId));
});

exports.createHandler = createHandler;
exports.handler = (event) => createHandler(require("./_lib/deps").realDeps())(event);
