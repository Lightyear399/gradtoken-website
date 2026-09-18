// POST /.netlify/functions/progress-update
// body: { course, lesson, status }   status: "in_progress" | "completed"
//
// Scoped to the session's address — the request body never includes a
// wallet address, so there's nothing for a caller to lie about.

const { json } = require("./_shared/http");
const { getSessionAddress } = require("./_shared/session");
const { getSupabase } = require("./_shared/supabase");

const VALID_STATUSES = new Set(["in_progress", "completed"]);

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

  const { course, lesson, status } = body;
  if (!course || !lesson || !VALID_STATUSES.has(status)) {
    return json(400, {
      error: "course, lesson, and a valid status (in_progress|completed) are required",
    });
  }

  const now = new Date().toISOString();
  const supabase = getSupabase();
  const { error } = await supabase.from("course_progress").upsert(
    {
      wallet_address: address,
      course_slug: course,
      lesson_slug: lesson,
      status,
      completed_at: status === "completed" ? now : null,
      updated_at: now,
    },
    { onConflict: "wallet_address,course_slug,lesson_slug" }
  );

  if (error) {
    return json(500, { error: error.message });
  }

  return json(200, { ok: true });
};
