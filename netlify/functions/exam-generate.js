// POST /.netlify/functions/exam-generate
// body: { course }
//
// Starts (or resumes) a timed final-exam attempt for the signed-in
// wallet. Scoped to the session's address, same as every other function
// here — the request body never carries a wallet address.
//
// Idempotent by design: if the wallet already has an in_progress attempt
// for this course, we return THAT attempt rather than assembling a new
// one. Otherwise refreshing the exam page mid-attempt would hand the
// student a brand new random question set and a reset 90-minute clock —
// free retries by accident.
//
// The response never contains correct_option_id, expected_result,
// rubric or reference_answer for any question — see
// sanitizeQuestionForClient in _shared/exam.js. That's deliberate:
// the same rule that keeps the Instructor & AI Tutor Guide off the
// tutor's replies applies here too.

const { json } = require("./_shared/http");
const { getSessionAddress } = require("./_shared/session");
const { getSupabase } = require("./_shared/supabase");
const {
  EXAM_DURATION_MINUTES,
  assembleExam,
  sanitizeQuestionForClient,
} = require("./_shared/exam");

// Which lesson_slugs in course_progress must be "completed" before an
// exam attempt for this course can be created. This is the one place in
// the mission-gating scheme that's a real, server-enforced boundary —
// everything else (the mission pages' own gate, the boss-fight checklist)
// is client-side UX built on self-reported progress. Starting a graded
// exam attempt is worth actually gating for real.
const REQUIRED_LESSONS = {
  "solidity-basics": ["mission-01", "mission-02", "mission-03", "mission-04"],
};

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return json(405, { error: "Method not allowed" });
  }

  const address = getSessionAddress(event);
  if (!address) {
    return json(401, { error: "Not signed in" });
  }

  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch {
    return json(400, { error: "Invalid JSON body" });
  }

  const { course } = body;
  if (!course) {
    return json(400, { error: "course is required" });
  }

  const supabase = getSupabase();

  const requiredLessons = REQUIRED_LESSONS[course];
  if (requiredLessons) {
    const { data: progress, error: progressErr } = await supabase
      .from("course_progress")
      .select("lesson_slug, status")
      .eq("wallet_address", address)
      .eq("course_slug", course);

    if (progressErr) return json(500, { error: progressErr.message });

    const completed = new Set(
      (progress || []).filter((p) => p.status === "completed").map((p) => p.lesson_slug)
    );
    const missing = requiredLessons.filter((l) => !completed.has(l));

    if (missing.length) {
      return json(403, {
        error: `Complete these first: ${missing.join(", ")}`,
        missing,
      });
    }
  }

  // 1. Resume an existing, still-live attempt if there is one.
  const { data: existing, error: existingErr } = await supabase
    .from("exam_attempts")
    .select("*")
    .eq("wallet_address", address)
    .eq("course_slug", course)
    .eq("status", "in_progress")
    .maybeSingle();

  if (existingErr) {
    return json(500, { error: existingErr.message });
  }

  if (existing) {
    if (new Date(existing.expires_at) > new Date()) {
      const { data: questions, error: qErr } = await supabase
        .from("exam_questions")
        .select("*")
        .in("id", existing.question_ids);
      if (qErr) return json(500, { error: qErr.message });

      // Preserve the original assembly order (question_ids is already in
      // the order the student was shown).
      const byId = new Map(questions.map((q) => [q.id, q]));
      const ordered = existing.question_ids.map((id) => byId.get(id));

      return json(200, {
        attemptId: existing.id,
        startedAt: existing.started_at,
        expiresAt: existing.expires_at,
        totalPoints: existing.total_points,
        questions: ordered.map(sanitizeQuestionForClient),
      });
    }

    // Stale attempt past its clock — close it out before making a new one.
    await supabase
      .from("exam_attempts")
      .update({ status: "expired" })
      .eq("id", existing.id);
  }

  // 2. Assemble a fresh attempt.
  const { data: pool, error: poolErr } = await supabase
    .from("exam_questions")
    .select("*")
    .eq("course_slug", course);

  if (poolErr) {
    return json(500, { error: poolErr.message });
  }

  let assembled;
  try {
    assembled = assembleExam(pool);
  } catch (e) {
    // Almost certainly means the question bank isn't fully seeded yet
    // for this course — surface that plainly rather than a generic 500.
    return json(500, {
      error: `Could not assemble an exam for "${course}": ${e.message}`,
    });
  }

  const now = new Date();
  const expiresAt = new Date(now.getTime() + EXAM_DURATION_MINUTES * 60 * 1000);
  const totalPoints = assembled.reduce((sum, q) => sum + q.points, 0);

  const { data: attempt, error: insertErr } = await supabase
    .from("exam_attempts")
    .insert({
      wallet_address: address,
      course_slug: course,
      question_ids: assembled.map((q) => q.id),
      started_at: now.toISOString(),
      expires_at: expiresAt.toISOString(),
      total_points: totalPoints,
      status: "in_progress",
    })
    .select()
    .single();

  if (insertErr) {
    return json(500, { error: insertErr.message });
  }

  return json(200, {
    attemptId: attempt.id,
    startedAt: attempt.started_at,
    expiresAt: attempt.expires_at,
    totalPoints: attempt.total_points,
    questions: assembled.map(sanitizeQuestionForClient),
  });
};
