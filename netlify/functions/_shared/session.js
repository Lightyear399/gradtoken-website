// netlify/functions/_shared/session.js
//
// Session + nonce token helpers shared by every function that needs to
// know "who is this request from" without ever storing a wallet address
// in a place client-side JS (or an XSS payload) could read it.
//
// - Session cookie is httpOnly + Secure + SameSite=Strict: JS on the page
//   can never read it, only send it automatically on same-origin requests.
// - Nonce tokens are short-lived signed JWTs embedded in the SIWE message
//   itself, so we don't need a database round trip just to issue one.

const jwt = require("jsonwebtoken");
const cookie = require("cookie");

const SESSION_COOKIE = "gt_session";
const SESSION_TTL = "7d";
const NONCE_TTL = "5m";

function getSecret() {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) {
    // Fail loudly rather than silently signing tokens with a weak/missing
    // secret — a short secret is brute-forceable and defeats the whole
    // point of a signed cookie.
    throw new Error(
      "SESSION_SECRET is missing or too short (needs 32+ random chars). " +
        "Set it in Netlify env vars before deploying."
    );
  }
  return secret;
}

// ---------- Nonce (SIWE challenge) ----------

function issueNonceToken(address) {
  return jwt.sign(
    { address: address.toLowerCase(), purpose: "siwe-nonce" },
    getSecret(),
    { expiresIn: NONCE_TTL }
  );
}

function verifyNonceToken(token, expectedAddress) {
  const decoded = jwt.verify(token, getSecret()); // throws if expired/invalid
  if (decoded.purpose !== "siwe-nonce") {
    throw new Error("Token is not a nonce token");
  }
  if (decoded.address !== expectedAddress.toLowerCase()) {
    throw new Error("Nonce was issued for a different address");
  }
  return true;
}

// ---------- Session (post-login) ----------

function issueSessionCookie(address) {
  const token = jwt.sign({ address: address.toLowerCase() }, getSecret(), {
    expiresIn: SESSION_TTL,
  });
  return cookie.serialize(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: true,
    sameSite: "strict",
    path: "/",
    maxAge: 7 * 24 * 60 * 60,
  });
}

function clearSessionCookie() {
  return cookie.serialize(SESSION_COOKIE, "", {
    httpOnly: true,
    secure: true,
    sameSite: "strict",
    path: "/",
    maxAge: 0,
  });
}

// Returns the lowercase wallet address for a valid session, or null.
// Never throws — callers should treat null as "not logged in".
function getSessionAddress(event) {
  const header = event.headers.cookie || event.headers.Cookie;
  if (!header) return null;
  const parsed = cookie.parse(header);
  const token = parsed[SESSION_COOKIE];
  if (!token) return null;
  try {
    const decoded = jwt.verify(token, getSecret());
    return decoded.address;
  } catch {
    return null;
  }
}

module.exports = {
  SESSION_COOKIE,
  issueNonceToken,
  verifyNonceToken,
  issueSessionCookie,
  clearSessionCookie,
  getSessionAddress,
};
