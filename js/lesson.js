// js/lesson.js
//
// Shared across all four mission pages. Zero dependencies, same style as
// wallet-connect.js. Two jobs:
//
// 1. Boss-fight checklist: purely local (localStorage), per mission, so a
//    student's checked-off items survive a refresh. This is a personal
//    tracking aid, not a grading mechanism — nothing here is submitted
//    anywhere.
// 2. "Mark mission complete": writes course_progress via
//    /.netlify/functions/progress-update. Requires a connected wallet
//    (same session cookie every other function uses). The button only
//    enables once every checklist item is checked, so it can't be
//    clicked before the boss requirements are self-reported done.
//
// This does NOT verify boss-fight work — there's no automated grading
// for the four mission boss fights (only the final exam and the capstone
// project have a review path). It's an honor-system progress marker,
// same spirit as ticking off a checklist in a notebook.

(function () {
  "use strict";

  function checklistKey(mission) {
    return `gt_boss_checklist_${mission}`;
  }

  function loadChecklist(mission) {
    try {
      const raw = localStorage.getItem(checklistKey(mission));
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  }

  function saveChecklist(mission, state) {
    try {
      localStorage.setItem(checklistKey(mission), JSON.stringify(state));
    } catch {
      /* no-op — checklist just won't persist across a refresh */
    }
  }

  function wireBossChecklist() {
    const list = document.querySelector(".boss-checklist");
    const completeBtn = document.getElementById("mission-complete-btn");
    if (!list) return;

    const mission = list.dataset.mission;
    const checkboxes = Array.from(list.querySelectorAll('input[type="checkbox"]'));
    const state = loadChecklist(mission);

    checkboxes.forEach((cb) => {
      if (state[cb.value]) cb.checked = true;
    });

    function updateButtonState() {
      const allChecked = checkboxes.every((cb) => cb.checked);
      if (completeBtn) completeBtn.disabled = !allChecked;
    }

    checkboxes.forEach((cb) => {
      cb.addEventListener("change", () => {
        state[cb.value] = cb.checked;
        saveChecklist(mission, state);
        updateButtonState();
      });
    });

    updateButtonState();
  }

  async function markComplete() {
    const btn = document.getElementById("mission-complete-btn");
    const feedback = document.getElementById("mission-complete-feedback");
    const list = document.querySelector(".boss-checklist");
    const mission = list ? list.dataset.mission : btn.dataset.mission;

    btn.disabled = true;
    feedback.textContent = "";

    try {
      const res = await fetch("/.netlify/functions/progress-update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ course: "solidity-basics", lesson: mission, status: "completed" }),
      });

      if (res.status === 401) {
        feedback.textContent = "Connect your wallet first, then mark this mission complete.";
        btn.disabled = false;
        return;
      }
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        feedback.textContent = err.error || "Couldn't save progress — try again.";
        btn.disabled = false;
        return;
      }

      btn.textContent = "Mission complete ✓";
      feedback.textContent = "Saved. On to the next mission whenever you're ready.";
    } catch {
      feedback.textContent = "Network error — try again in a moment.";
      btn.disabled = false;
    }
  }

  function wireCompleteButton() {
    const btn = document.getElementById("mission-complete-btn");
    if (!btn) return;
    btn.addEventListener("click", markComplete);
  }


  // Sticky bottom pager + end-of-lesson Next button.
  // Reads the existing .lesson-nav links at the top of the page (prev / next),
  // so no per-page HTML edits are needed. CSP-safe: classes only, no inline styles.
  function buildPager() {
    const top = document.querySelector(".lesson-nav");
    if (!top) return;
    const links = top.querySelectorAll(":scope > a");
    if (links.length < 2) return;
    const prev = links[0];
    const next = links[links.length - 1];
    const dots = top.querySelectorAll(".dots .dot");
    let current = 0;
    dots.forEach((d, i) => { if (d.classList.contains("active")) current = i + 1; });
    const label = dots.length && current ? "Mission " + current + " of " + dots.length : "";

    function makeLink(src, cls, isNext) {
      const a = document.createElement("a");
      a.className = cls;
      a.href = src.getAttribute("href");
      a.textContent = src.textContent.trim();
      if (isNext) a.rel = "next"; else a.rel = "prev";
      return a;
    }

    // 1) Sticky bar at the bottom of the viewport
    const bar = document.createElement("nav");
    bar.className = "pager-bar";
    bar.setAttribute("aria-label", "Lesson navigation");
    const mid = document.createElement("span");
    mid.className = "pager-label";
    mid.textContent = label;
    bar.appendChild(makeLink(prev, "pager-link pager-prev", false));
    bar.appendChild(mid);
    bar.appendChild(makeLink(next, "pager-link pager-next", true));
    document.body.appendChild(bar);
    document.body.classList.add("has-pager");

    // 2) Big Next button at the end of the lesson (under "Mark mission complete")
    const completeBar = document.querySelector(".lesson-complete-bar");
    if (completeBar) {
      const end = document.createElement("a");
      end.className = "btn-primary pager-end";
      end.href = next.getAttribute("href");
      end.textContent = next.textContent.trim();
      completeBar.appendChild(end);
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    wireBossChecklist();
    wireCompleteButton();
    buildPager();
  });
})();
