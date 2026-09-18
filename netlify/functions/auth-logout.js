// POST /.netlify/functions/auth-logout

const { withCookie, json } = require("./_shared/http");
const { clearSessionCookie } = require("./_shared/session");

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return json(405, { error: "Method not allowed" });
  }
  return withCookie(200, { ok: true }, clearSessionCookie());
};
