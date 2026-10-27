// ADMIN. POST {status?: "pending"|"approved"|"rejected"|"resubmit", courseId?} -> submissions with rubrics.
const { HttpError, parseBody, run } = require("./_lib/http");
const { COURSES } = require("./_lib/config");
const { requireAdmin } = require("./_lib/admin");
const { rubricFor } = require("./_lib/review");

const STATUSES = ["pending", "approved", "rejected", "resubmit"];

const createHandler = (deps) => (event) => run(event, async () => {
  await requireAdmin(deps, event);
  const b = parseBody(event);
  const status = b.status || "pending";
  if (!STATUSES.includes(status)) throw new HttpError(400, "Bad status");
  const courseId = b.courseId && COURSES[b.courseId] ? b.courseId : undefined;
  const rows = await deps.db.listSubmissions({ status, courseId, limit: 50 });
  const items = [];
  for (const r of rows) {
    items.push({
      id: r.id, userId: r.user_id, email: await deps.db.getUserEmail(r.user_id),
      courseId: r.course_id, courseTitle: COURSES[r.course_id] || r.course_id, component: r.component,
      content: r.content, repoUrl: r.repo_url, status: r.status, submittedAt: r.submitted_at,
      scorePct: r.score_pct, feedback: r.feedback, rubric: rubricFor(r.course_id, r.component),
    });
  }
  return { courses: COURSES, items };
});

exports.createHandler = createHandler;
exports.handler = (event) => createHandler(require("./_lib/deps").realDeps())(event);
