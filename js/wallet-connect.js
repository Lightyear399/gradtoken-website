// js/wallet-connect.js
//
// Two connection paths, tried in order:
//   1. window.ethereum (MetaMask or any EIP-1193 browser extension) —
//      zero dependencies, works on desktop.
//   2. WalletConnect (js/walletconnect-bundle.js, loaded separately) —
//      the fallback for everywhere an extension can't exist: mobile
//      browsers and the installed PWA. Shows a QR code / deep link that
//      hands off to whatever wallet app is on the phone.
// Both paths end up calling the same fetchNonceMessage/verifySignature
// functions below, so the backend never needs to know which one was used.
//
// Usage: include this on any page with
//   <button id="wallet-connect-btn">Connect Wallet</button>
//   <span id="wallet-status"></span>
// and it wires itself up on DOMContentLoaded.

(function () {
  "use strict";

  function formatGrad(decimalString) {
    // decimalString is already human-readable (formatUnits'd server-side),
    // this just trims to 2 decimals for display without pulling in a
    // math/formatting library for one line of work.
    const n = Number(decimalString);
    if (Number.isNaN(n)) return decimalString;
    return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
  }

  // Tracks which connection path is active so signMessage()/logout() can
  // route to the right place. Extension wallets need nothing tracked
  // (window.ethereum is always just there); WalletConnect needs its own
  // session, held inside js/walletconnect-bundle.js, not here.
  let usingWalletConnect = false;

  async function getWalletAddress() {
    if (window.ethereum) {
      const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
      if (!accounts || !accounts.length) {
        throw new Error("No account was authorized.");
      }
      usingWalletConnect = false;
      return accounts[0];
    }

    // No browser extension (the normal case on mobile — phones don't
    // support browser extensions at all) — fall back to WalletConnect,
    // which hands off to whatever wallet app is installed via a QR code
    // or deep link instead.
    if (window.GradWC) {
      const address = await window.GradWC.connect();
      usingWalletConnect = true;
      return address;
    }

    throw new Error("No wallet found, and the WalletConnect fallback failed to load.");
  }

  async function fetchNonceMessage(address) {
    const res = await fetch(`/.netlify/functions/auth-nonce?address=${address}`);
    if (!res.ok) throw new Error("Could not get a sign-in message.");
    const data = await res.json();
    return data.message;
  }

  async function signMessage(address, message) {
    if (usingWalletConnect) {
      return window.GradWC.signMessage(address, message);
    }
    // personal_sign is plain EIP-1193, no library required.
    return window.ethereum.request({
      method: "personal_sign",
      params: [message, address],
    });
  }

  async function verifySignature(address, message, signature) {
    const res = await fetch("/.netlify/functions/auth-verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ address, message, signature }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || "Sign-in failed.");
    }
    return res.json();
  }

  async function connectWallet() {
    const address = await getWalletAddress();
    const message = await fetchNonceMessage(address);
    const signature = await signMessage(address, message);
    return verifySignature(address, message, signature);
  }

  async function checkSession() {
    const res = await fetch("/.netlify/functions/auth-me");
    if (!res.ok) return null;
    const data = await res.json();
    return data.address;
  }

  async function logout() {
    if (usingWalletConnect && window.GradWC) {
      await window.GradWC.disconnect().catch(() => {});
      usingWalletConnect = false;
    }
    await fetch("/.netlify/functions/auth-logout", { method: "POST" });
  }

  async function getOnchainSummary() {
    const res = await fetch("/.netlify/functions/onchain-summary");
    if (!res.ok) return null;
    return res.json();
  }

  function shortAddress(addr) {
    return addr.slice(0, 6) + "…" + addr.slice(-4);
  }

  function wireUpUI() {
    const btn = document.getElementById("wallet-connect-btn");
    const status = document.getElementById("wallet-status");
    const dashLink = document.getElementById("wallet-dashboard-link");
    if (!btn || !status) return; // page doesn't have the widget, nothing to do

    function renderConnected(address) {
      btn.textContent = "Disconnect";
      status.textContent = shortAddress(address);
      status.title = address;
      if (dashLink) dashLink.style.display = "";
    }

    function renderDisconnected() {
      btn.textContent = "Connect Wallet";
      status.textContent = "";
      status.title = "";
      if (dashLink) dashLink.style.display = "none";
    }

    btn.addEventListener("click", async () => {
      btn.disabled = true;
      try {
        if (btn.textContent === "Disconnect") {
          await logout();
          renderDisconnected();
        } else {
          const { address } = await connectWallet();
          renderConnected(address);
        }
      } catch (err) {
        status.textContent = err.message;
      } finally {
        btn.disabled = false;
      }
    });

    // On load, check if a session already exists (page refresh case).
    checkSession().then((address) => {
      if (address) renderConnected(address);
    });
  }

  document.addEventListener("DOMContentLoaded", wireUpUI);

  // Exposed for pages that want balance/stake display beyond the basic
  // connect button (e.g. a future dashboard page).
  window.GradWallet = { connectWallet, checkSession, logout, getOnchainSummary, formatGrad };
})();
