// INTERNAL. Your exam backend calls this after auto-grading quizzes or the MCQ exam.
// Header x-internal-secret must equal INTERNAL_SECRET. Body {userId, courseId, component, passed, score?}.
const crypto = require("crypto");
const { HttpError, parseBody, run } = require("./_lib/http");
const { REQUIREMENTS } = require("./_lib/config");
const { requireCourse } = require("./_lib/admin");

const safeEqual = (a, b) => {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};

const createHandler = (deps) => (event) => run(event, async () => {
  const given = event.headers?.["x-internal-secret"] || "";
  if (!deps.internalSecret || !safeEqual(given, deps.internalSecret)) throw new HttpError(401, "Unauthorised");
  const b = parseBody(event);
  const course = requireCourse(b.courseId);
  if (!REQUIREMENTS[course].auto.includes(b.component)) throw new HttpError(400, "Not an auto-graded component");
  if (!b.userId) throw new HttpError(400, "userId required");
  await deps.db.upsertComponent({
    userId: String(b.userId), courseId: course, component: b.component,
    passed: b.passed === true, score: typeof b.score === "number" ? b.score : null, source: "auto",
  });
  return { recorded: true };
});

exports.createHandler = createHandler;
exports.handler = (event) => createHandler(require("./_lib/deps").realDeps())(event);
