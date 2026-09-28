// js/mission-gate.js
//
// UI-level gate for mission pages (and, with a small variant, the exam
// page — see solidity-basics-exam.html's inline use of these same ids).
// Reads data-requires-missions off <body> — a comma-separated list of
// lesson_slugs that must show status "completed" in course_progress
// before this page's content is shown.
//
// This is a UX layer, not the security boundary: course_progress is
// self-reported (the boss-fight checklist in lesson.js writes it after
// an honor-system checklist, not a graded submission), so a determined
// student could call progress-update directly and skip ahead regardless
// of what this script shows. What this script actually stops is casual,
// accidental mission-skipping — clicking a link and landing on content
// you haven't earned yet. The one place a prerequisite is enforced for
// real is server-side, in exam-generate.js, because starting an exam
// attempt is the one action here worth actually gating.
//
// Fails OPEN on a network error: a flaky connection shouldn't lock a
// legitimate student out of material they're entitled to. The real gate
// for the exam is server-side regardless of what this script decides.

(function () {
  "use strict";

  const COURSE = "solidity-basics";

  function missionLabel(slug) {
    const n = slug.split("-")[1];
    return `Mission ${n}`;
  }

  async function fetchCompletedSet() {
    const res = await fetch(`/.netlify/functions/progress-get?course=${COURSE}`);
    if (res.status === 401) return { signedIn: false, completed: new Set() };
    if (!res.ok) throw new Error("progress-get failed: " + res.status);
    const data = await res.json();
    const completed = new Set(
      (data.progress || []).filter((p) => p.status === "completed").map((p) => p.lesson_slug)
    );
    return { signedIn: true, completed };
  }

  function reveal() {
    const content = document.getElementById("gate-content");
    const locked = document.getElementById("gate-locked");
    if (content) content.style.display = "";
    if (locked) locked.style.display = "none";
  }

  function lock(missing, signedIn) {
    const content = document.getElementById("gate-content");
    const locked = document.getElementById("gate-locked");
    if (content) content.style.display = "none";
    if (!locked) return;
    locked.style.display = "";
    const msg = document.getElementById("gate-locked-message");
    if (msg) {
      msg.textContent = signedIn
        ? `Finish ${missing.map(missionLabel).join(" and ")} first, then come back.`
        : "Connect your wallet so we can check your progress, then click Check again.";
    }
  }

  async function runGate() {
    const requires = (document.body.dataset.requiresMissions || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    if (requires.length === 0) {
      reveal();
      return;
    }

    try {
      const { signedIn, completed } = await fetchCompletedSet();
      if (!signedIn) {
        lock(requires, false);
        return;
      }
      const missing = requires.filter((m) => !completed.has(m));
      if (missing.length) lock(missing, true);
      else reveal();
    } catch {
      reveal(); // fail open — see file header
    }
  }

  function wireRecheck() {
    const btn = document.getElementById("gate-recheck-btn");
    if (btn) btn.addEventListener("click", runGate);
  }

  document.addEventListener("DOMContentLoaded", () => {
    wireRecheck();
    runGate();
  });
})();
