// POST /.netlify/functions/auth-verify
// body: { address, message, signature }
//
// Step 2 of Sign-In with Ethereum. Three checks, all of which must pass:
//   1. The signature actually recovers to the claimed address (proves
//      they control the private key).
//   2. The nonce embedded in the message is one we issued, unexpired,
//      and was issued for this same address (proves this isn't a replayed
//      or forged message).
//   3. (Implicit) The message hasn't been altered, because changing a
//      single byte of it changes the recovered address in check 1.
//
// On success: upsert a row in `users`, issue an httpOnly session cookie.
// No password, no email, no third-party auth provider — the wallet IS
// the identity.

const { ethers } = require("ethers");
const { json, withCookie } = require("./_shared/http");
const { verifyNonceToken, issueSessionCookie } = require("./_shared/session");
const { getSupabase } = require("./_shared/supabase");

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return json(405, { error: "Method not allowed" });
  }

  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch {
    return json(400, { error: "Invalid JSON body" });
  }

  const { address, message, signature } = body;
  if (!address || !message || !signature || !ethers.isAddress(address)) {
    return json(400, { error: "address, message, and signature are required" });
  }
  const normalized = address.toLowerCase();

  // 1. Signature must recover to the claimed address.
  let recovered;
  try {
    recovered = ethers.verifyMessage(message, signature);
  } catch {
    return json(401, { error: "Signature could not be verified" });
  }
  if (recovered.toLowerCase() !== normalized) {
    return json(401, { error: "Signature does not match the claimed address" });
  }

  // 2. Nonce embedded in the message must be one we issued, for this address.
  const nonceMatch = message.match(/Nonce:\s*(\S+)/);
  if (!nonceMatch) {
    return json(400, { error: "Message is missing a nonce" });
  }
  try {
    verifyNonceToken(nonceMatch[1], normalized);
  } catch (err) {
    return json(401, { error: "Nonce is invalid, expired, or was reused: " + err.message });
  }

  // Passed both checks — this really is the wallet owner, right now, for
  // a message issued by us. Upsert the user and issue a session.
  try {
    const supabase = getSupabase();
    const { error } = await supabase
      .from("users")
      .upsert(
        { wallet_address: normalized, last_login_at: new Date().toISOString() },
        { onConflict: "wallet_address" }
      );
    if (error) throw error;
  } catch (err) {
    return json(500, { error: "Could not record login: " + err.message });
  }

  const setCookie = issueSessionCookie(normalized);
  return withCookie(200, { ok: true, address: normalized }, setCookie);
};
