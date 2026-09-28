// POST /.netlify/functions/exam-grade
// body: { attemptId, answers: [{ questionId, answer }] }
//
// Submits an in-progress exam attempt and auto-grades whatever can be
// graded mechanically. This is intentionally NOT a full grader — per the
// blueprint's own marking conventions, conceptual partial credit,
// debugging writeups and the practical section all need a human reading
// the answer. Those are stored as-is and left for manual review in the
// Supabase table editor (same pattern as `submissions.status` today —
// see db/SETUP.md, "What's NOT done yet").
//
// What auto-grades:
//   multiple_choice — exact match against correct_option_id, full points
//                     or zero.
//   short_result    — a lenient case-insensitive "does the submitted
//                      result contain the expected phrase" check, worth
//                      half the question's points (the marking guide's
//                      "2 for correct result" half of a 4-point
//                      question). This is a heuristic, not a precise
//                      grader — false negatives are possible if a
//                      correct answer is phrased unexpectedly. Spot-check
//                      short_result auto-grades before trusting a pass
//                      that hinges on one.
//   free_response    — never auto-graded. Always 0 automatically, always
//                      flagged for review.
//
// This function never returns a correct answer, expected result,
// rubric or reference_answer in its response — win or lose, a student
// only ever learns their score, not the answer key. That's the same
// rule sanitizeQuestionForClient enforces in exam-generate.js.

const { json } = require("./_shared/http");
const { getSessionAddress } = require("./_shared/session");
const { getSupabase } = require("./_shared/supabase");
const { PASS_FRACTION } = require("./_shared/exam");

function gradeMultipleChoice(question, answer) {
  const submitted = answer && typeof answer === "object" ? answer.optionId : answer;
  const correct = submitted === question.correct_option_id;
  return { pointsAwarded: correct ? question.points : 0, needsReview: false };
}

function gradeShortResult(question, answer) {
  const submittedResult =
    answer && typeof answer === "object" ? answer.result : answer;
  const expected = (question.expected_result || "").trim().toLowerCase();
  const submitted = (submittedResult || "").trim().toLowerCase();

  const resultMatches = expected.length > 0 && submitted.includes(expected);
  const resultPoints = resultMatches ? Math.round(question.points / 2) : 0;

  // The reasoning half always needs a human, per the marking guide
  // ("2 for correct result, 2 for correct reasoning").
  return { pointsAwarded: resultPoints, needsReview: true };
}

function gradeFreeResponse() {
  return { pointsAwarded: 0, needsReview: true };
}

function maxAutoPointsFor(question) {
  switch (question.format) {
    case "multiple_choice":
      return question.points;
    case "short_result":
      return Math.round(question.points / 2);
    case "free_response":
    default:
      return 0;
  }
}

function gradeAnswer(question, answer) {
  if (answer === undefined || answer === null || answer === "") {
    return { pointsAwarded: 0, needsReview: question.format !== "multiple_choice" };
  }
  switch (question.format) {
    case "multiple_choice":
      return gradeMultipleChoice(question, answer);
    case "short_result":
      return gradeShortResult(question, answer);
    case "free_response":
    default:
      return gradeFreeResponse();
  }
}

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

  const { attemptId, answers } = body;
  if (!attemptId || !Array.isArray(answers)) {
    return json(400, { error: "attemptId and an answers array are required" });
  }

  const supabase = getSupabase();

  const { data: attempt, error: attemptErr } = await supabase
    .from("exam_attempts")
    .select("*")
    .eq("id", attemptId)
    .maybeSingle();

  if (attemptErr) return json(500, { error: attemptErr.message });
  if (!attempt) return json(404, { error: "Attempt not found" });

  // Scoped to the session address — a wallet can only ever grade its own
  // attempt, regardless of what attemptId a client sends.
  if (attempt.wallet_address !== address) {
    return json(403, { error: "This attempt does not belong to you" });
  }

  if (attempt.status !== "in_progress") {
    return json(409, { error: `Attempt is already ${attempt.status}` });
  }

  const now = new Date();
  if (now > new Date(attempt.expires_at)) {
    await supabase
      .from("exam_attempts")
      .update({ status: "expired" })
      .eq("id", attempt.id);
    return json(410, { error: "Time expired — this attempt was not submitted" });
  }

  const { data: questions, error: qErr } = await supabase
    .from("exam_questions")
    .select("*")
    .in("id", attempt.question_ids);
  if (qErr) return json(500, { error: qErr.message });

  const questionById = new Map(questions.map((q) => [q.id, q]));
  const answerByQuestionId = new Map(
    answers.map((a) => [a.questionId, a.answer])
  );

  let autoScore = 0;
  let maxAutoScore = 0;
  let anyNeedsReview = false;
  const storedAnswers = {};

  for (const questionId of attempt.question_ids) {
    const question = questionById.get(questionId);
    if (!question) continue; // shouldn't happen, but don't crash grading over it

    const submitted = answerByQuestionId.get(questionId);
    const { pointsAwarded, needsReview } = gradeAnswer(question, submitted);

    autoScore += pointsAwarded;
    maxAutoScore += maxAutoPointsFor(question);
    if (needsReview) anyNeedsReview = true;
    storedAnswers[questionId] = submitted === undefined ? null : submitted;
  }

  const status = anyNeedsReview ? "submitted" : "graded";

  const { error: updateErr } = await supabase
    .from("exam_attempts")
    .update({
      answers: storedAnswers,
      auto_score: autoScore,
      max_auto_score: maxAutoScore,
      submitted_at: now.toISOString(),
      status,
      // If nothing needs review, the auto score IS the final score.
      final_score: anyNeedsReview ? null : autoScore,
      passed: anyNeedsReview
        ? null
        : autoScore / attempt.total_points >= PASS_FRACTION,
    })
    .eq("id", attempt.id);

  if (updateErr) return json(500, { error: updateErr.message });

  return json(200, {
    ok: true,
    attemptId: attempt.id,
    autoScore,
    maxAutoScore,
    totalPoints: attempt.total_points,
    needsReview: anyNeedsReview,
    message: anyNeedsReview
      ? "Submitted. Part of your score needs manual review before it's final."
      : "Submitted and graded.",
  });
};
