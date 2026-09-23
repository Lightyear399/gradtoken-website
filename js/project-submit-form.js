// js/project-submit-form.js
//
// Progressive enhancement: without this script (or without JS at all),
// the form still works exactly as before — a plain mailto: submission,
// no wallet required. With it, and with a wallet connected, submissions
// go to submission-create instead, which runs the automated Etherscan
// verification check and shows up on /dashboard.html.
//
// This deliberately does NOT auto-fall-back to mailto from JS when the
// wallet isn't connected — that would silently submit an email the user
// didn't necessarily mean to send. Instead it tells them to connect, and
// leaves the (still fully functional) mailto path as their own choice.

(function () {
  "use strict";

  async function handleSubmit(event) {
    const form = document.getElementById("project-submit-form");
    const feedback = document.getElementById("project-submit-feedback");
    const btn = document.getElementById("project-submit-btn");
    if (!form || !window.GradWallet) return; // let the native mailto submit happen

    const address = await window.GradWallet.checkSession();
    if (!address) {
      event.preventDefault();
      feedback.textContent =
        "Connect your wallet (top right) to submit through the site — or leave it as is and this will email your submission instead.";
      return;
    }

    // Wallet is connected: take over the submission entirely.
    event.preventDefault();

    const contractAddress = document.getElementById("contract").value.trim();
    const repoUrl = document.getElementById("repo").value.trim();
    const rationale = document.getElementById("writeup").value.trim();

    btn.disabled = true;
    feedback.textContent = "Submitting…";

    try {
      const res = await fetch("/.netlify/functions/submission-create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          course: "solidity-basics",
          contractAddress,
          repoUrl: repoUrl || undefined,
          rationale,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        feedback.textContent = data.error || "Submission failed.";
        return;
      }
      feedback.textContent = data.message;
      form.reset();
    } catch {
      feedback.textContent = "Network error — your submission wasn't sent. Try again, or use the email fallback below.";
    } finally {
      btn.disabled = false;
    }
  }

  async function prefillWalletField() {
    const walletField = document.getElementById("wallet");
    if (!walletField || !window.GradWallet) return;
    const address = await window.GradWallet.checkSession();
    if (address) {
      walletField.value = address;
      walletField.readOnly = true;
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    const form = document.getElementById("project-submit-form");
    if (form) form.addEventListener("submit", handleSubmit);
    prefillWalletField();
  });
})();
