// GET /.netlify/functions/progress-get?course=solidity-basics
//
// Always scoped to the SESSION's address, never a client-supplied one —
// there is no "?address=" param here on purpose. Otherwise anyone could
// read anyone else's course progress just by knowing their wallet.

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
    .from("course_progress")
    .select("lesson_slug, status, completed_at, updated_at")
    .eq("wallet_address", address)
    .eq("course_slug", course);

  if (error) {
    return json(500, { error: error.message });
  }

  return json(200, { course, progress: data });
};
