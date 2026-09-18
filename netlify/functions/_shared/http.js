// netlify/functions/_shared/http.js
//
// No CORS headers anywhere in this backend, on purpose: every function is
// only ever called from gradtoken.netlify.app itself (same-origin fetch),
// matching the site's "no third-party requests" posture. If this API is
// ever meant to be called from another origin, that's a deliberate
// decision to make later, not a default to fall into.

function json(statusCode, body, extraHeaders) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      ...(extraHeaders || {}),
    },
    body: JSON.stringify(body),
  };
}

function withCookie(statusCode, body, setCookieValue) {
  return json(statusCode, body, { "Set-Cookie": setCookieValue });
}

module.exports = { json, withCookie };
