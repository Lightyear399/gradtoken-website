const { COURSES, REQUIREMENTS, COMPONENT_LABELS, RUBRICS, PASS_MARK } = require("./config");

const rubricFor = (course, component) => ({
  criteria: RUBRICS[`${course}:${component}`] || RUBRICS[component] || [],
  passMark: PASS_MARK,
});

async function checklist(db, userId, course) {
  const req = REQUIREMENTS[course];
  const rows = await db.listComponents(userId, course);
  const by = Object.fromEntries(rows.map((r) => [r.component, r]));
  const items = [
    ...req.auto.map((component) => ({ component, kind: "auto" })),
    ...req.manual.map((component) => ({ component, kind: "manual" })),
  ].map((i) => ({
    ...i,
    label: COMPONENT_LABELS[i.component] || i.component,
    passed: !!by[i.component]?.passed,
    source: by[i.component]?.source || null,
    score: by[i.component]?.score ?? null,
  }));
  const completion = await db.getCompletion(userId, course);
  return {
    course, title: COURSES[course], items,
    ready: items.every((i) => i.passed),
    finalized: !!(completion && completion.status === "passed" && completion.cert_tx),
  };
}
module.exports = { rubricFor, checklist };
