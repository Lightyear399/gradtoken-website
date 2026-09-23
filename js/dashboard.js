// js/dashboard.js
//
// Relies on window.GradWallet from wallet-connect.js (loaded first). This
// file only runs the dashboard-specific reads (balance, submission status)
// — it doesn't duplicate any of the connect/disconnect logic.

(function () {
  "use strict";

  function showState(id) {
    ["dashboard-loading", "dashboard-disconnected", "dashboard-connected"].forEach((el) => {
      const node = document.getElementById(el);
      if (node) node.style.display = el === id ? "" : "none";
    });
  }

  function renderSubmission(sub) {
    const textEl = document.getElementById("submission-status-text");
    const detailEl = document.getElementById("submission-status-detail");
    if (!textEl || !detailEl) return;

    if (!sub) {
      textEl.textContent = "No submission yet.";
      detailEl.textContent = "";
      return;
    }

    const statusLabel = {
      pending: "Pending review",
      approved: "Approved",
      rejected: "Needs changes",
    }[sub.status] || sub.status;

    textEl.textContent = statusLabel;

    const parts = [];
    parts.push(
      sub.contract_verified
        ? "Contract verification: confirmed on Etherscan."
        : "Contract verification: not confirmed yet — double-check the verify step."
    );
    if (sub.reviewer_note) {
      parts.push("Reviewer note: " + sub.reviewer_note);
    }
    detailEl.textContent = parts.join(" ");
  }

  async function loadDashboard() {
    const address = await window.GradWallet.checkSession();
    if (!address) {
      showState("dashboard-disconnected");
      return;
    }

    showState("dashboard-connected");

    // On-chain balances
    try {
      const summary = await window.GradWallet.getOnchainSummary();
      if (summary) {
        document.getElementById("stat-balance").textContent =
          window.GradWallet.formatGrad(summary.gradBalance) + " GRAD";
        document.getElementById("stat-staked").textContent =
          window.GradWallet.formatGrad(summary.staked) + " GRAD";
        document.getElementById("stat-earned").textContent =
          window.GradWallet.formatGrad(summary.earned) + " GRAD";
      }
    } catch {
      // Leave the "—" placeholders — an RPC hiccup shouldn't block the
      // rest of the page from working.
    }

    // Solidity Basics submission status
    try {
      const res = await fetch("/.netlify/functions/submission-status?course=solidity-basics");
      if (res.ok) {
        const data = await res.json();
        renderSubmission(data.submission);
      }
    } catch {
      renderSubmission(null);
    }
  }

  document.addEventListener("DOMContentLoaded", loadDashboard);
})();
