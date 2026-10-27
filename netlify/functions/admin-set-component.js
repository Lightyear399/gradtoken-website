// ADMIN. POST {userId, courseId, component, note}. Manual override for an auto-graded component
// (quizzes or MCQ exam) until your exam backend posts results to record-component. Needs a note.
const { HttpError, parseBody, run } = require("./_lib/http");
const { REQUIREMENTS } = require("./_lib/config");
const { requireAdmin, requireCourse } = require("./_lib/admin");
const { checklist } = require("./_lib/review");

const createHandler = (deps) => (event) => run(event, async () => {
  await requireAdmin(deps, event);
  const b = parseBody(event);
  const course = requireCourse(b.courseId);
  if (!b.userId) throw new HttpError(400, "userId required");
  if (!REQUIREMENTS[course].auto.includes(b.component)) throw new HttpError(400, "Only auto-graded components can be set manually");
  const note = String(b.note || "").trim();
  if (note.length < 10) throw new HttpError(400, "Add a note (10+ characters) saying why");
  await deps.db.upsertComponent({ userId: String(b.userId), courseId: course, component: b.component, passed: true, source: "admin", note });
  return checklist(deps.db, String(b.userId), course);
});

exports.createHandler = createHandler;
exports.handler = (event) => createHandler(require("./_lib/deps").realDeps())(event);
