// ADMIN. POST {submissionId, decision: "approve"|"reject"|"resubmit", scores: {criterionId: n}, feedback}
// The server re-checks scores against the rubric: approval needs the pass mark AND every gate criterion.
const { HttpError, parseBody, run } = require("./_lib/http");
const { requireAdmin } = require("./_lib/admin");
const { rubricFor, checklist } = require("./_lib/review");

const createHandler = (deps) => (event) => run(event, async () => {
  const admin = await requireAdmin(deps, event);
  const b = parseBody(event);
  const sub = await deps.db.getSubmission(b.submissionId);
  if (!sub) throw new HttpError(404, "Submission not found");
  if (sub.status !== "pending") throw new HttpError(409, "Already reviewed");
  if (!["approve", "reject", "resubmit"].includes(b.decision)) throw new HttpError(400, "Bad decision");

  const { criteria, passMark } = rubricFor(sub.course_id, sub.component);
  const scores = {};
  let total = 0, max = 0;
  for (const c of criteria) {
    const v = Number(b.scores?.[c.id]);
    if (!Number.isInteger(v) || v < 0 || v > c.max) throw new HttpError(400, `Score for "${c.label}" must be 0-${c.max}`);
    scores[c.id] = v; total += v; max += c.max;
  }
  const pct = max ? total / max : 0;
  const feedback = String(b.feedback || "").trim().slice(0, 2000);

  if (b.decision === "approve") {
    if (pct < passMark) throw new HttpError(400, "Score is below the pass mark. Request a resubmission or reject.");
    const gate = criteria.find((c) => c.min && scores[c.id] < c.min);
    if (gate) throw new HttpError(400, `"${gate.label}" must score at least ${gate.min} to approve`);
  } else if (feedback.length < 10) {
    throw new HttpError(400, "Feedback (10+ characters) is required when not approving");
  }

  const status = { approve: "approved", reject: "rejected", resubmit: "resubmit" }[b.decision];
  await deps.db.updateSubmission(sub.id, {
    status, scores, score_pct: Math.round(pct * 100), feedback: feedback || null,
    reviewed_by: admin.id, reviewed_at: new Date().toISOString(),
  });
  if (status === "approved") {
    await deps.db.upsertComponent({
      userId: sub.user_id, courseId: sub.course_id, component: sub.component,
      passed: true, score: Math.round(pct * 100), source: "review",
    });
  }
  return { status, scorePct: Math.round(pct * 100), checklist: await checklist(deps.db, sub.user_id, sub.course_id) };
});

exports.createHandler = createHandler;
exports.handler = (event) => createHandler(require("./_lib/deps").realDeps())(event);
