// netlify/functions/_shared/exam.js
//
// Pure logic for assembling a randomized exam from the exam_questions
// pool, per the blueprint (see the private Instructor & AI Tutor Guide —
// this file only encodes the RULES, never the question content itself).
//
// Blueprint recap:
//   Section A — 10 of 20, at least 2 drawn from each mission M1–M4
//   Section B — 5 of 12, at least 1 each tagged storage_memory,
//               access_control_or_sender, eth_or_revert
//   Section C — 5 of 12, at least 1 tagged security_bug and
//               at least 1 tagged compile_error
//   Section D — 1 of however many practical tasks exist
//
// None of this file touches the database or the network — it's plain
// array logic, so it's easy to unit-test on its own if that ever seems
// worthwhile.

const EXAM_DURATION_MINUTES = 90;
const PASS_FRACTION = 0.7; // 70/100, per the course blueprint

const MISSIONS = ["M1", "M2", "M3", "M4"];
const SECTION_A_TOTAL = 10;
const SECTION_A_MIN_PER_MISSION = 2;
const SECTION_B_TOTAL = 5;
const SECTION_B_REQUIRED_TAGS = [
  "storage_memory",
  "access_control_or_sender",
  "eth_or_revert",
];
const SECTION_C_TOTAL = 5;
const SECTION_C_REQUIRED_TAGS = ["security_bug", "compile_error"];
const SECTION_D_TOTAL = 1;

function shuffle(arr) {
  const copy = arr.slice();
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function hasTag(question, tag) {
  return Array.isArray(question.tags) && question.tags.includes(tag);
}

// Guarantees >= minPerGroup questions from each value of groupField,
// then fills the rest of `total` randomly from whatever's left.
// Used for Section A (groupField: "mission", groups: MISSIONS).
function pickWithMinPerGroup(pool, groupField, groups, minPerGroup, total) {
  const picked = [];
  const pickedIds = new Set();

  for (const group of groups) {
    const candidates = shuffle(
      pool.filter((q) => q[groupField] === group && !pickedIds.has(q.id))
    );
    const take = candidates.slice(0, minPerGroup);
    if (take.length < minPerGroup) {
      throw new Error(
        `Not enough questions tagged ${groupField}=${group}: need ${minPerGroup}, have ${take.length}`
      );
    }
    for (const q of take) {
      picked.push(q);
      pickedIds.add(q.id);
    }
  }

  if (picked.length > total) {
    throw new Error(
      `Minimum-per-group requirement (${picked.length}) exceeds section total (${total})`
    );
  }

  const remainingPool = shuffle(pool.filter((q) => !pickedIds.has(q.id)));
  for (const q of remainingPool) {
    if (picked.length >= total) break;
    picked.push(q);
    pickedIds.add(q.id);
  }

  if (picked.length < total) {
    throw new Error(
      `Question pool too small: needed ${total}, only found ${picked.length}`
    );
  }

  return shuffle(picked);
}

// Guarantees >= 1 question carrying each tag in requiredTags, then fills
// the rest of `total` randomly. Used for Section B and Section C.
function pickWithRequiredTags(pool, requiredTags, total) {
  const picked = [];
  const pickedIds = new Set();

  for (const tag of requiredTags) {
    const candidates = shuffle(
      pool.filter((q) => hasTag(q, tag) && !pickedIds.has(q.id))
    );
    if (candidates.length === 0) {
      throw new Error(`No available question tagged "${tag}"`);
    }
    picked.push(candidates[0]);
    pickedIds.add(candidates[0].id);
  }

  if (picked.length > total) {
    throw new Error(
      `Required-tag count (${picked.length}) exceeds section total (${total})`
    );
  }

  const remainingPool = shuffle(pool.filter((q) => !pickedIds.has(q.id)));
  for (const q of remainingPool) {
    if (picked.length >= total) break;
    picked.push(q);
    pickedIds.add(q.id);
  }

  if (picked.length < total) {
    throw new Error(
      `Question pool too small: needed ${total}, only found ${picked.length}`
    );
  }

  return shuffle(picked);
}

function pickRandom(pool, total) {
  if (pool.length < total) {
    throw new Error(`Question pool too small: needed ${total}, only found ${pool.length}`);
  }
  return shuffle(pool).slice(0, total);
}

// allQuestions: every exam_questions row for this course_slug.
// Returns the assembled array of full question rows (still containing
// correct answers etc.) — the caller is responsible for stripping those
// before sending anything to the client. Throws if the bank can't
// satisfy the blueprint (e.g. not seeded yet, or a tag is missing) —
// callers should surface that as a 500 with a clear message rather than
// silently shipping an unfair or under-filled exam.
function assembleExam(allQuestions) {
  const bySection = {
    A: allQuestions.filter((q) => q.section === "A"),
    B: allQuestions.filter((q) => q.section === "B"),
    C: allQuestions.filter((q) => q.section === "C"),
    D: allQuestions.filter((q) => q.section === "D"),
  };

  const sectionA = pickWithMinPerGroup(
    bySection.A,
    "mission",
    MISSIONS,
    SECTION_A_MIN_PER_MISSION,
    SECTION_A_TOTAL
  );
  const sectionB = pickWithRequiredTags(
    bySection.B,
    SECTION_B_REQUIRED_TAGS,
    SECTION_B_TOTAL
  );
  const sectionC = pickWithRequiredTags(
    bySection.C,
    SECTION_C_REQUIRED_TAGS,
    SECTION_C_TOTAL
  );
  const sectionD = pickRandom(bySection.D, SECTION_D_TOTAL);

  // Keep sections in A/B/C/D order for the student, randomized within
  // each section already.
  return [...sectionA, ...sectionB, ...sectionC, ...sectionD];
}

// Strips every answer-bearing field before a question is allowed anywhere
// near the client. This is the one function that guards the "never hand
// exam answers to a student" rule at the API boundary — call it on every
// question in every response, no exceptions.
function sanitizeQuestionForClient(q) {
  return {
    id: q.id,
    section: q.section,
    mission: q.mission,
    format: q.format,
    points: q.points,
    prompt: q.prompt,
    options: Array.isArray(q.options)
      ? q.options.map((o) => ({ id: o.id, text: o.text }))
      : undefined,
  };
}

module.exports = {
  EXAM_DURATION_MINUTES,
  PASS_FRACTION,
  MISSIONS,
  SECTION_A_TOTAL,
  SECTION_B_TOTAL,
  SECTION_C_TOTAL,
  SECTION_D_TOTAL,
  assembleExam,
  sanitizeQuestionForClient,
};
