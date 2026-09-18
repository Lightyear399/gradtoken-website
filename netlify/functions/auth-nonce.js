// GET /.netlify/functions/auth-nonce?address=0x...
//
// Step 1 of Sign-In with Ethereum: the wallet asks for something to sign.
// We hand back a human-readable message with a short-lived signed nonce
// embedded in it. No database write needed to issue this — the nonce is
// self-verifying (see _shared/session.js).

const { ethers } = require("ethers");
const { json } = require("./_shared/http");
const { issueNonceToken } = require("./_shared/session");

exports.handler = async (event) => {
  if (event.httpMethod !== "GET") {
    return json(405, { error: "Method not allowed" });
  }

  const address = event.queryStringParameters && event.queryStringParameters.address;
  if (!address || !ethers.isAddress(address)) {
    return json(400, { error: "A valid Ethereum address is required" });
  }

  const normalized = address.toLowerCase();
  const nonceToken = issueNonceToken(normalized);
  const domain = process.env.SITE_DOMAIN || "gradtoken.netlify.app";
  const issuedAt = new Date().toISOString();

  const message =
    `${domain} wants you to sign in with your Ethereum account:\n` +
    `${normalized}\n\n` +
    `Sign in to GradLearn to track your course progress and claim certificates.\n\n` +
    `URI: https://${domain}\n` +
    `Version: 1\n` +
    `Nonce: ${nonceToken}\n` +
    `Issued At: ${issuedAt}`;

  return json(200, { message });
};
