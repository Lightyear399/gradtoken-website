// js/wallet-connect.js
//
// Deliberately zero dependencies — no ethers/wagmi/web3modal bundle. The
// only browser API this needs is window.ethereum (injected by MetaMask
// or any EIP-1193 wallet) and fetch() to our own /.netlify/functions/*
// endpoints. Self-hosted, same-origin, matches the site's
// script-src 'self' / connect-src 'self' CSP with no exceptions needed.
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

  async function getWalletAddress() {
    if (!window.ethereum) {
      throw new Error("No wallet found. Install MetaMask or another Ethereum wallet extension.");
    }
    const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
    if (!accounts || !accounts.length) {
      throw new Error("No account was authorized.");
    }
    return accounts[0];
  }

  async function fetchNonceMessage(address) {
    const res = await fetch(`/.netlify/functions/auth-nonce?address=${address}`);
    if (!res.ok) throw new Error("Could not get a sign-in message.");
    const data = await res.json();
    return data.message;
  }

  async function signMessage(address, message) {
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
    if (!btn || !status) return; // page doesn't have the widget, nothing to do

    function renderConnected(address) {
      btn.textContent = "Disconnect";
      status.textContent = shortAddress(address);
      status.title = address;
    }

    function renderDisconnected() {
      btn.textContent = "Connect Wallet";
      status.textContent = "";
      status.title = "";
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
