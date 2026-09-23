// GET /.netlify/functions/submission-status?course=solidity-basics
//
// Scoped to the session's address, same pattern as progress-get — no
// way to query anyone else's submission by wallet address.

const { json } = require("./_shared/http");
const { getSessionAddress } = require("./_shared/session");
const { getSupabase } = require("./_shared/supabase");

exports.handler = async (event) => {
  if (event.httpMethod !== "GET") {
    return json(405, { error: "Method not allowed" });
  }

  const address = getSessionAddress(event);
  if (!address) {
    return json(401, { error: "Not signed in" });
  }

  const course = event.queryStringParameters && event.queryStringParameters.course;
  if (!course) {
    return json(400, { error: "course query param is required" });
  }

  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("submissions")
    .select("status, contract_verified, submitted_at, reviewed_at, reviewer_note")
    .eq("wallet_address", address)
    .eq("course_slug", course)
    .order("submitted_at", { ascending: false })
    .limit(1);

  if (error) {
    return json(500, { error: error.message });
  }

  return json(200, { course, submission: data && data[0] ? data[0] : null });
};
