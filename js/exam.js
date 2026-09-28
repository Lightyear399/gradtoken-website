// js/exam.js
//
// Zero-dependency, same as wallet-connect.js and project-submit-form.js —
// just fetch() against our own /.netlify/functions/* endpoints.
//
// State machine: idle -> in-progress -> submitted
//
// Mid-exam refresh safety: the server (exam-generate) already returns the
// SAME question set and clock for an in-progress attempt, so refreshing
// never resets the timer or reshuffles questions. What it can't preserve
// is text the student typed but hadn't submitted yet — that's autosaved
// to localStorage, keyed by attemptId, and restored on the next render.
// This is a client-side convenience only; the server has no idea it
// exists and never sees it until Submit is pressed.

(function () {
  "use strict";

  const COURSE = "solidity-basics";
  const LOW_TIME_THRESHOLD_MS = 2 * 60 * 1000; // last 2 minutes: pulse the clock

  let currentQuestions = [];
  let currentAttempt = null;
  let timerHandle = null;
  let submitting = false;

  function draftKey(attemptId) {
    return `gt_exam_draft_${attemptId}`;
  }

  function saveDraft() {
    if (!currentAttempt) return;
    const answers = collectAnswers();
    try {
      localStorage.setItem(draftKey(currentAttempt.attemptId), JSON.stringify(answers));
    } catch {
      // localStorage full or unavailable — the exam still works, it just
      // won't survive a refresh. Not worth interrupting the student over.
    }
  }

  function loadDraft(attemptId) {
    try {
      const raw = localStorage.getItem(draftKey(attemptId));
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  function clearDraft(attemptId) {
    try {
      localStorage.removeItem(draftKey(attemptId));
    } catch {
      /* no-op */
    }
  }

  function formatClock(ms) {
    const totalSeconds = Math.max(0, Math.floor(ms / 1000));
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${String(seconds).padStart(2, "0")}`;
  }

  function el(tag, attrs, children) {
    const node = document.createElement(tag);
    if (attrs) {
      for (const [k, v] of Object.entries(attrs)) {
        if (k === "text") node.textContent = v;
        else node.setAttribute(k, v);
      }
    }
    (children || []).forEach((c) => c && node.appendChild(c));
    return node;
  }

  function renderQuestion(q) {
    const wrap = el("div", { class: "exam-question", id: `qwrap_${q.id}` });
    wrap.appendChild(
      el("div", { class: "q-meta", text: `Section ${q.section}${q.mission ? " · " + q.mission : ""} · ${q.points} pts` })
    );
    wrap.appendChild(el("div", { class: "q-prompt", text: q.prompt }));

    if (q.format === "multiple_choice" && Array.isArray(q.options)) {
      const group = el("div", { class: "exam-options", role: "radiogroup" });
      q.options.forEach((opt) => {
        const label = el("label", { class: "exam-option" });
        const input = el("input", { type: "radio", name: `q_${q.id}`, value: opt.id });
        label.appendChild(input);
        label.appendChild(el("span", { text: opt.text }));
        group.appendChild(label);
      });
      wrap.appendChild(group);
    } else if (q.format === "short_result") {
      wrap.appendChild(el("label", { class: "field-label", for: `q_${q.id}_result`, text: "Your answer" }));
      wrap.appendChild(el("input", { type: "text", id: `q_${q.id}_result`, name: `q_${q.id}_result` }));
      wrap.appendChild(el("label", { class: "field-label", for: `q_${q.id}_reasoning`, text: "Explain your reasoning" }));
      wrap.appendChild(el("textarea", { id: `q_${q.id}_reasoning`, name: `q_${q.id}_reasoning`, rows: "3" }));
    } else {
      wrap.appendChild(el("label", { class: "field-label", for: `q_${q.id}`, text: "Your answer" }));
      wrap.appendChild(el("textarea", { id: `q_${q.id}`, name: `q_${q.id}`, rows: q.section === "D" ? "10" : "5" }));
    }

    return wrap;
  }

  function renderExam(questions) {
    const container = document.getElementById("exam-questions");
    container.innerHTML = "";
    const sections = ["A", "B", "C", "D"];
    const labels = {
      A: "Section A — Conceptual",
      B: "Section B — Code prediction",
      C: "Section C — Debugging",
      D: "Section D — Practical",
    };
    for (const s of sections) {
      const inSection = questions.filter((q) => q.section === s);
      if (!inSection.length) continue;
      const sectionEl = el("div", { class: "exam-section" });
      sectionEl.appendChild(el("div", { class: "exam-section-label", text: labels[s] }));
      inSection.forEach((q) => sectionEl.appendChild(renderQuestion(q)));
      container.appendChild(sectionEl);
    }
  }

  function applyDraft(draft) {
    for (const { questionId, answer } of draft) {
      if (answer && typeof answer === "object" && "optionId" in answer) {
        const input = document.querySelector(`input[name="q_${questionId}"][value="${CSS.escape(answer.optionId)}"]`);
        if (input) input.checked = true;
      } else if (answer && typeof answer === "object" && "result" in answer) {
        const r = document.getElementById(`q_${questionId}_result`);
        const rs = document.getElementById(`q_${questionId}_reasoning`);
        if (r) r.value = answer.result || "";
        if (rs) rs.value = answer.reasoning || "";
      } else if (typeof answer === "string") {
        const field = document.getElementById(`q_${questionId}`);
        if (field) field.value = answer;
      }
    }
  }

  function collectAnswers() {
    const answers = [];
    for (const q of currentQuestions) {
      if (q.format === "multiple_choice") {
        const checked = document.querySelector(`input[name="q_${q.id}"]:checked`);
        if (checked) answers.push({ questionId: q.id, answer: { optionId: checked.value } });
      } else if (q.format === "short_result") {
        const result = (document.getElementById(`q_${q.id}_result`) || {}).value || "";
        const reasoning = (document.getElementById(`q_${q.id}_reasoning`) || {}).value || "";
        if (result.trim() || reasoning.trim()) {
          answers.push({ questionId: q.id, answer: { result: result.trim(), reasoning: reasoning.trim() } });
        }
      } else {
        const field = document.getElementById(`q_${q.id}`);
        const val = field ? field.value.trim() : "";
        if (val) answers.push({ questionId: q.id, answer: val });
      }
    }
    return answers;
  }

  function updateProgress() {
    const answered = collectAnswers().length;
    const progressEl = document.getElementById("exam-progress");
    if (progressEl) progressEl.textContent = `${answered} of ${currentQuestions.length} answered`;
  }

  function announce(message) {
    const live = document.getElementById("exam-live-region");
    if (live) live.textContent = message;
  }

  function startTimer(expiresAtIso) {
    const timerBar = document.getElementById("exam-timer-bar");
    const clockEl = document.getElementById("exam-clock");
    const expiresAt = new Date(expiresAtIso).getTime();
    let warned10 = false;
    let warned2 = false;

    function tick() {
      const remaining = expiresAt - Date.now();
      if (remaining <= 0) {
        clockEl.textContent = "0:00";
        clearInterval(timerHandle);
        announce("Time is up. Submitting your exam now.");
        submitExam(true);
        return;
      }
      clockEl.textContent = formatClock(remaining);
      if (remaining <= LOW_TIME_THRESHOLD_MS) {
        timerBar.classList.add("low-time");
        if (!warned2) {
          warned2 = true;
          announce("Two minutes remaining.");
        }
      } else if (remaining <= 10 * 60 * 1000 && !warned10) {
        warned10 = true;
        announce("Ten minutes remaining.");
      }
    }

    tick();
    timerHandle = setInterval(tick, 1000);
  }

  function showPanel(name) {
    ["exam-start-panel", "exam-in-progress-panel", "exam-result-panel"].forEach((id) => {
      const p = document.getElementById(id);
      if (p) p.style.display = id === name ? "" : "none";
    });
  }

  async function beginExam() {
    const startBtn = document.getElementById("exam-start-btn");
    const startFeedback = document.getElementById("exam-start-feedback");
    startBtn.disabled = true;
    startFeedback.textContent = "";

    try {
      const res = await fetch("/.netlify/functions/exam-generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ course: COURSE }),
      });

      if (res.status === 401) {
        startFeedback.textContent = "Connect your wallet first, then try again.";
        return;
      }
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        startFeedback.textContent = err.error || "Couldn't start the exam. Try again in a moment.";
        return;
      }

      const data = await res.json();
      currentAttempt = { attemptId: data.attemptId, expiresAt: data.expiresAt, totalPoints: data.totalPoints };
      currentQuestions = data.questions;

      renderExam(currentQuestions);
      applyDraft(loadDraft(data.attemptId));
      updateProgress();
      startTimer(data.expiresAt);
      document.getElementById("exam-timer-bar").style.display = "";
      showPanel("exam-in-progress-panel");

      document.getElementById("exam-questions").addEventListener("input", () => {
        saveDraft();
        updateProgress();
      });
      document.getElementById("exam-questions").addEventListener("change", () => {
        saveDraft();
        updateProgress();
      });
    } catch (e) {
      startFeedback.textContent = "Network error — check your connection and try again.";
    } finally {
      startBtn.disabled = false;
    }
  }

  async function submitExam(auto) {
    if (submitting || !currentAttempt) return;
    if (!auto) {
      const ok = window.confirm("Submit your exam now? You won't be able to change any answers after this.");
      if (!ok) return;
    }
    submitting = true;
    if (timerHandle) clearInterval(timerHandle);

    const submitBtn = document.getElementById("exam-submit-btn");
    if (submitBtn) submitBtn.disabled = true;

    const answers = collectAnswers();

    try {
      const res = await fetch("/.netlify/functions/exam-grade", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ attemptId: currentAttempt.attemptId, answers }),
      });

      const data = await res.json().catch(() => ({}));

      if (res.status === 410) {
        renderOutcome("Time expired before this reached the server — your attempt was closed without scoring. Contact support if you believe this is wrong.", null);
        return;
      }
      if (!res.ok) {
        renderOutcome(data.error || "Something went wrong submitting your exam.", null, true);
        submitting = false;
        if (submitBtn) submitBtn.disabled = false;
        return;
      }

      clearDraft(currentAttempt.attemptId);
      renderOutcome(data.message, data);
    } catch (e) {
      renderOutcome("Network error while submitting. Your answers are still saved locally — try Submit again.", null, true);
      submitting = false;
      if (submitBtn) submitBtn.disabled = false;
    }
  }

  function renderOutcome(message, data, retryable) {
    showPanel("exam-result-panel");
    document.getElementById("exam-timer-bar").style.display = "none";
    const panel = document.getElementById("exam-result-panel");
    panel.innerHTML = "";
    const box = el("div", { class: "exam-result" });
    if (data) {
      box.appendChild(el("div", { class: "score", text: `${data.autoScore} / ${data.totalPoints}` }));
      box.appendChild(el("p", { class: "form-note", text: "points auto-graded so far" }));
    }
    box.appendChild(el("p", { text: message }));
    if (retryable) {
      const retry = el("button", { class: "btn-primary", type: "button", text: "Try submitting again" });
      retry.addEventListener("click", () => submitExam(false));
      box.appendChild(retry);
    }
    panel.appendChild(box);
  }

  function wireStartButton() {
    const startBtn = document.getElementById("exam-start-btn");
    const submitBtn = document.getElementById("exam-submit-btn");
    if (!startBtn) return; // this page isn't loaded

    startBtn.addEventListener("click", beginExam);
    if (submitBtn) submitBtn.addEventListener("click", () => submitExam(false));

    window.addEventListener("beforeunload", (e) => {
      if (currentAttempt && !submitting) {
        e.preventDefault();
        e.returnValue = "";
      }
    });
  }

  document.addEventListener("DOMContentLoaded", wireStartButton);
})();
