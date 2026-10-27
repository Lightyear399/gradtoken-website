const { HttpError } = require("./http");
const { REQUIREMENTS } = require("./config");
async function requireAdmin(deps, event) {
  const user = await deps.auth(event);
  if (user.app_metadata?.role !== "admin") throw new HttpError(403, "Admin only");
  return user;
}
function requireCourse(slug) {
  const c = String(slug || "");
  if (!REQUIREMENTS[c]) throw new HttpError(400, "Unknown course");
  return c;
}
module.exports = { requireAdmin, requireCourse };
