// Only these course slugs can ever be rewarded or certified. Keep in sync with the site.
const COURSES = {
  "solidity-basics": "Solidity Basics",
  "intro-to-blockchain": "Intro to Blockchain",
  "excel-business-communication": "Excel and Business Communication",
  "data-analytics": "Data Analytics",
};
const auto = ["quizzes", "exam"];
const REQUIREMENTS = {
  "solidity-basics": { auto, manual: ["exam_free_response", "capstone"] },
  "intro-to-blockchain": { auto, manual: ["capstone"] },
  "excel-business-communication": { auto, manual: ["capstone"] },
  "data-analytics": { auto, manual: ["capstone"] },
};
const COMPONENT_LABELS = {
  quizzes: "Quizzes", exam: "Exam (auto-graded)", exam_free_response: "Exam free-response", capstone: "Capstone project",
};
const PASS_MARK = 0.6; // share of total rubric points needed to approve
// `min` makes a criterion a gate: approval needs at least that score on it, whatever the total.
const RUBRICS = {
  capstone: [
    { id: "brief", label: "Meets the project brief", max: 5 },
    { id: "works", label: "Works correctly", max: 5 },
    { id: "quality", label: "Quality and clarity", max: 5 },
    { id: "original", label: "Original work, no copying", max: 5, min: 3 },
  ],
  exam_free_response: [
    { id: "accuracy", label: "Accurate answers", max: 5 },
    { id: "reasoning", label: "Reasoning shown", max: 5 },
  ],
  "solidity-basics:capstone": [
    { id: "deployed", label: "Contract deployed and verified on testnet", max: 5 },
    { id: "tests", label: "Tests included and passing", max: 5 },
    { id: "security", label: "Follows safe patterns, no obvious vulnerabilities", max: 5, min: 2 },
    { id: "original", label: "Original work, no copying", max: 5, min: 3 },
  ],
};
module.exports = {
  COURSES, REQUIREMENTS, COMPONENT_LABELS, RUBRICS, PASS_MARK,
  VOUCHER_TTL_SECONDS: 3600,
  HOLD_SECONDS: 7 * 24 * 3600,   // must match HOLD_PERIOD in GradRewards
  FLAG_MAX_QUALIFIED_PER_30D: 5, // more than this in 30 days => manual review
  MAX_VOUCHERS_PER_REQUEST: 20,
};
