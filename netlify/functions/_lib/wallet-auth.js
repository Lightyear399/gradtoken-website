// Turns your existing wallet session (the httpOnly gt_session cookie, read by _shared/session.js) into the
// "user" object every function here expects. The user's id IS their lowercase wallet address.
// Admins are the wallets listed (comma separated) in the ADMIN_WALLETS Netlify variable.
const { HttpError } = require("./http");

const parseAdmins = (csv) => new Set(String(csv || "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean));

function authFromEvent(event, { getSessionAddress, adminWallets }) {
  const address = getSessionAddress(event);
  if (!address) throw new HttpError(401, "Not signed in");
  const id = String(address).toLowerCase();
  return { id, address: id, app_metadata: parseAdmins(adminWallets).has(id) ? { role: "admin" } : {} };
}
module.exports = { authFromEvent, parseAdmins };
