// LEARNER. POST {courseId, component, content, repoUrl?} -> queues work for review.
// Only components that need a human reviewer can be submitted (e.g. capstone, exam_free_response).
const { HttpError, parseBody, run } = require("./_lib/http");
const { REQUIREMENTS } = require("./_lib/config");
const { requireCourse } = require("./_lib/admin");

const createHandler = (deps) => (event) => run(event, async () => {
  const user = await deps.auth(event);
  const b = parseBody(event);
  const course = requireCourse(b.courseId);
  const component = String(b.component || "");
  if (!REQUIREMENTS[course].manual.includes(component)) throw new HttpError(400, "That component is not submitted for review");

  const content = String(b.content || "").trim();
  if (content.length < 20) throw new HttpError(400, "Describe your work in at least 20 characters");
  if (content.length > 20000) throw new HttpError(400, "Submission is too long");
  const repoUrl = String(b.repoUrl || "").trim();
  if (repoUrl && (repoUrl.length > 500 || !/^https:\/\//i.test(repoUrl))) throw new HttpError(400, "Links must start with https://");

  if (await deps.db.hasActiveSubmission(user.id, course, component)) {
    throw new HttpError(409, "You already have this component waiting for review or approved");
  }
  try {
    const id = await deps.db.insertSubmission({
      user_id: user.id, course_id: course, component, content, repo_url: repoUrl || null,
    });
    return { submitted: true, id };
  } catch (e) {
    if (e.code === "active_exists") throw new HttpError(409, "You already have this component waiting for review or approved");
    throw e;
  }
});

exports.createHandler = createHandler;
exports.handler = (event) => createHandler(require("./_lib/deps").realDeps())(event);
