// GET /.netlify/functions/auth-me
//
// Because the session cookie is httpOnly, client-side JS can't read it
// directly to decide "show connect button" vs "show dashboard". This
// endpoint is the sanctioned way to ask "who am I, if anyone" without
// exposing the token itself to the page.

const { json } = require("./_shared/http");
const { getSessionAddress } = require("./_shared/session");

exports.handler = async (event) => {
  if (event.httpMethod !== "GET") {
    return json(405, { error: "Method not allowed" });
  }
  const address = getSessionAddress(event);
  return json(200, { address });
};
