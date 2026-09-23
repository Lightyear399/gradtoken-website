// POST /.netlify/functions/submission-create
// body: { course, contractAddress, rationale }
//
// Implements the dual-condition gate pattern used across GradLearn:
// an automated check (is this contract actually verified on Etherscan?)
// PLUS human review (does the written rationale show real understanding?)
// before a certificate is issued. Neither check alone is sufficient —
// a verified contract with a copy-pasted rationale, or a great rationale
// for an unverified/nonexistent contract, both fail to prove the work.
//
// The Etherscan call happens here, server-side, using ETHERSCAN_API_KEY
// (already provisioned in .env for contract verification during deploy)
// — never exposed to the browser.

const { ethers } = require("ethers");
const { json } = require("./_shared/http");
const { getSessionAddress } = require("./_shared/session");
const { getSupabase } = require("./_shared/supabase");

async function isVerifiedOnEtherscan(contractAddress) {
  const apiKey = process.env.ETHERSCAN_API_KEY;
  if (!apiKey) throw new Error("ETHERSCAN_API_KEY missing from env vars");

  const url =
    `https://api-sepolia.etherscan.io/api?module=contract&action=getsourcecode` +
    `&address=${contractAddress}&apikey=${apiKey}`;

  const res = await fetch(url);
  const data = await res.json();
  const sourceCode = data?.result?.[0]?.SourceCode;
  return typeof sourceCode === "string" && sourceCode.length > 0;
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

  const { course, contractAddress, repoUrl, rationale } = body;
  if (!course || !contractAddress || !ethers.isAddress(contractAddress) || !rationale) {
    return json(400, {
      error: "course, a valid contractAddress, and rationale are all required",
    });
  }
  if (rationale.trim().length < 50) {
    return json(400, { error: "Rationale is too short to review meaningfully" });
  }

  let verified;
  try {
    verified = await isVerifiedOnEtherscan(contractAddress);
  } catch (err) {
    return json(502, { error: "Could not reach Etherscan: " + err.message });
  }

  const supabase = getSupabase();
  const { error } = await supabase.from("submissions").insert({
    wallet_address: address,
    course_slug: course,
    contract_address: contractAddress,
    repo_url: repoUrl || null,
    rationale,
    contract_verified: verified,
    status: "pending", // human review always required, even if verified === true
    submitted_at: new Date().toISOString(),
  });

  if (error) {
    return json(500, { error: error.message });
  }

  return json(200, {
    ok: true,
    contractVerified: verified,
    message: verified
      ? "Contract verification confirmed automatically. Your submission is now queued for review."
      : "Submitted, but this contract address isn't showing as verified on Etherscan yet — " +
        "review will likely come back with that flagged. Double-check you ran the verify step.",
  });
};
