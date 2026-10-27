class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
const json = (status, body) => ({
  statusCode: status,
  headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  body: JSON.stringify(body),
});
function parseBody(event) {
  try { return JSON.parse(event.body || "{}"); } catch { throw new HttpError(400, "Invalid JSON"); }
}
async function run(event, fn) {
  if (event.httpMethod !== "POST") return json(405, { error: "POST only" });
  try { return json(200, await fn()); }
  catch (e) {
    if (e instanceof HttpError) return json(e.status, { error: e.message });
    console.error(e);
    return json(500, { error: "Server error" });
  }
}
module.exports = { HttpError, json, parseBody, run };
