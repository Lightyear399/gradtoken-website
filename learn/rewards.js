(() => {
  "use strict";
  // ---- Fill these in: contract addresses come from deployments/<network>.json ----
  const REWARDS = "0xREWARDS_ADDRESS";
  const GRAD = "0xGRAD_ADDRESS";
  const CERT = "0xCERTIFICATE_ADDRESS";
  const CHAIN = { id: "0x14a34", name: "Base Sepolia", rpc: "https://sepolia.base.org", explorer: "https://sepolia.basescan.org" };
  const FN = "/.netlify/functions/";
  // Free project id from cloud.reown.com (WalletConnect). Leave the placeholder to hide the WalletConnect option.
  const WC_PROJECT_ID = "YOUR-REOWN-PROJECT-ID";

  const A = window.GradAbi, $ = (id) => document.getElementById(id);
  let sessionAddr = null, account = null, status = { wallet: null, courses: [] };

  function h(tag, props, ...kids) {  // textContent only: server or learner text can never run as HTML
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(props || {})) {
      if (k === "onclick") el.addEventListener("click", v); else if (v !== false && v != null) el.setAttribute(k, v);
    }
    for (const k of kids.flat()) if (k != null) el.append(k.nodeType ? k : document.createTextNode(String(k)));
    return el;
  }
  const say = (text, cls) => { const m = $("msg"); m.hidden = !text; m.textContent = text || ""; m.className = cls || ""; };
  const short = (a) => a.slice(0, 6) + "..." + a.slice(-4);
  let wcProvider = null;
  const eth = () => wcProvider || window.ethereum;

  async function api(name, body) {
    const r = await fetch(FN + name, { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body || {}) });
    const j = await r.json().catch(() => ({}));
    if (r.status === 401) { sessionAddr = null; throw new Error("Please sign in again."); }
    if (!r.ok) throw new Error(j.error || "Request failed");
    return j;
  }
  async function guard(btn, fn) {
    btn.disabled = true; say("");
    try { await fn(); } catch (e) { say(A.friendlyError(e), "err"); } finally { btn.disabled = false; }
  }

  // ---- wallet ----
  async function ensureChain() {
    if ((await eth().request({ method: "eth_chainId" })) === CHAIN.id) return;
    try { await eth().request({ method: "wallet_switchEthereumChain", params: [{ chainId: CHAIN.id }] }); }
    catch (e) {
      if (e.code !== 4902) throw e;
      await eth().request({ method: "wallet_addEthereumChain", params: [{ chainId: CHAIN.id, chainName: CHAIN.name, rpcUrls: [CHAIN.rpc], blockExplorerUrls: [CHAIN.explorer], nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 } }] });
    }
  }
  async function connect() {
    const accts = await eth().request({ method: "eth_requestAccounts" });
    account = accts[0];
    await ensureChain();
  }
  async function call(to, data) { return eth().request({ method: "eth_call", params: [{ to, data }, "latest"] }); }
  async function sendTx(data) {
    await ensureChain();
    const hash = await eth().request({ method: "eth_sendTransaction", params: [{ from: account, to: REWARDS, data }] });
    say("Waiting for confirmation...");
    for (let i = 0; i < 45; i++) {
      const rc = await eth().request({ method: "eth_getTransactionReceipt", params: [hash] });
      if (rc) { if (rc.status !== "0x1") throw new Error("Transaction failed"); return hash; }
      await new Promise((r) => setTimeout(r, 2000));
    }
    throw new Error("Still pending. Check your wallet, then refresh.");
  }
  const txLink = (hash) => h("a", { href: CHAIN.explorer + "/tx/" + hash, target: "_blank", rel: "noopener" }, "View transaction");


  // ---- WalletConnect (lazy: the 600 KB bundle only loads when someone taps the button) ----
  const wcEnabled = () => /^[0-9a-f]{32}$/i.test(WC_PROJECT_ID);
  const wcFlag = { set() { try { localStorage.setItem("gt_wc_active", "1"); } catch { /* private mode */ } }, clear() { try { localStorage.removeItem("gt_wc_active"); } catch { /* ignore */ } }, on() { try { return localStorage.getItem("gt_wc_active") === "1"; } catch { return false; } } };
  function loadWC() {
    if (window.GradWC) return Promise.resolve();
    return new Promise((res, rej) => {
      const s = document.createElement("script");
      s.src = "walletconnect.bundle.js"; s.onload = res; s.onerror = () => rej(new Error("Could not load WalletConnect. Check your connection."));
      document.head.append(s);
    });
  }
  function showPairing(uri) {
    const box = $("wcpanel"); if (!box) return;
    box.hidden = false;
    box.replaceChildren(
      h("p", { class: "muted" }, "Scan with your wallet app, or open your wallet on this phone:"),
      window.GradWC.qrSvg(document, uri),
      h("div", {}, window.GradWC.deepLinks(uri).map((l) => h("a", { class: "btn ghost", href: l.href }, l.name))),
      h("button", { class: "ghost", type: "button", onclick: async (e) => { try { await navigator.clipboard.writeText(uri); e.target.textContent = "Copied"; } catch { e.target.textContent = "Copy failed"; } } }, "Copy link"));
  }
  function hookWC(p) {
    wcProvider = p; account = (p.accounts && p.accounts[0]) || null; wcFlag.set();
    p.on("accountsChanged", (a) => { account = a[0] || null; refresh(true).catch(() => {}); });
    p.on("disconnect", () => { wcProvider = null; account = null; wcFlag.clear(); refresh(true).catch(() => {}); });
  }
  async function connectWC() {
    await loadWC();
    const p = await window.GradWC.createWcProvider({ projectId: WC_PROJECT_ID, chainId: parseInt(CHAIN.id, 16), rpcUrl: CHAIN.rpc, onUri: showPairing });
    await p.connect();
    hookWC(p);
    await ensureChain();
    await refresh();
  }
  async function restoreWC() {  // only when this browser previously connected with WalletConnect
    if (!wcEnabled() || !wcFlag.on() || window.ethereum) return;
    try {
      await loadWC();
      const p = await window.GradWC.createWcProvider({ projectId: WC_PROJECT_ID, chainId: parseInt(CHAIN.id, 16), rpcUrl: CHAIN.rpc });
      if (p.session) hookWC(p); else wcFlag.clear();
    } catch { wcFlag.clear(); }
  }
  const wcButton = () => wcEnabled() ? h("button", { class: "ghost", onclick: (e) => guard(e.target, connectWC) }, "Connect with WalletConnect") : null;
  const wcPanel = () => wcEnabled() ? h("div", { id: "wcpanel", hidden: "" }) : null;

  // ---- render ----
  function installHelp() {
    const here = encodeURIComponent(location.href), bare = location.host + location.pathname;
    return [h("p", {}, "Open this page in a wallet app to continue:"),
      h("a", { class: "btn", href: "https://metamask.app.link/dapp/" + bare }, "MetaMask"),
      h("a", { class: "btn ghost", href: "https://link.trustwallet.com/open_url?coin_id=60&url=" + here }, "Trust Wallet"),
      h("a", { class: "btn ghost", href: "https://go.cb-w.com/dapp?cb_url=" + here }, "Coinbase Wallet")];
  }
  async function renderWallet() {
    const box = $("wallet"); box.replaceChildren(h("h2", {}, "Wallet"));
    if (!eth()) { box.append(wcButton(), wcPanel(), ...installHelp()); return; }
    if (!account) { box.append(h("button", { onclick: (e) => guard(e.target, async () => { await connect(); await refresh(); }) }, "Connect wallet"), wcButton(), wcPanel()); return; }
    box.append(h("p", {}, "Connected: ", h("code", {}, short(account))));
    if (wcProvider) box.append(h("button", { class: "ghost", onclick: (e) => guard(e.target, async () => { await wcProvider.disconnect(); }) }, "Disconnect"));
    const signInBtn = (label) => h("button", { onclick: (e) => guard(e.target, async () => { sessionAddr = await window.GradSiwe.signIn(eth(), account); await refresh(); }) }, label);
    if (!sessionAddr) {
      box.append(h("p", { class: "muted" }, "Sign in with this wallet to see your courses. It signs a message, no fee."), signInBtn("Sign in"));
    } else if (sessionAddr !== account.toLowerCase()) {
      box.append(h("p", { class: "err" }, "You are signed in as " + short(sessionAddr) + ". Switch to that wallet, or sign in with this one."), signInBtn("Sign in with this wallet"));
    } else {
      const bal = A.formatUnits(await call(GRAD, A.encodeBalanceOf(account)));
      box.append(h("p", { class: "ok" }, "Signed in. Balance: " + bal + " GRAD"),
        h("button", { class: "ghost", onclick: (e) => guard(e.target, async () => { await window.GradSiwe.signOut(); sessionAddr = null; await refresh(); }) }, "Sign out"));
    }
  }
  const walletReady = () => !!(account && sessionAddr && sessionAddr === account.toLowerCase());

  async function renderCourses() {
    const box = $("courses"); box.replaceChildren(h("h2", {}, "Courses"));
    for (const c of status.courses) {
      let right;
      if (!c.passed) right = h("span", { class: "muted" }, "In progress");
      else if (!walletReady()) right = h("span", { class: "muted" }, "Sign in with this wallet to claim");
      else {
        const claimed = (await call(REWARDS, A.encodeCourseClaimed(account, c.courseId))).endsWith("1");
        right = claimed ? h("span", { class: "ok" }, "Claimed") : h("button", { onclick: (e) => guard(e.target, () => claimCourse(c.course)) }, "Claim 3 GRAD");
      }
      box.append(h("div", { class: "row" }, h("span", {}, c.title, c.certified ? " (certified)" : ""), right));
    }
    if (status.courses.some((c) => c.certified) && sessionAddr)
      box.append(h("a", { class: "btn ghost", href: CHAIN.explorer + "/address/" + CERT, target: "_blank", rel: "noopener" }, "Certificate contract"));
  }
  async function claimCourse(slug) {
    const v = await api("claim-voucher", { courseId: slug });
    const hash = await sendTx(A.encodeClaimCourse(v.courseId, v.deadline, v.signature));
    say("Claimed! ", "ok"); $("msg").append(txLink(hash));
    await refresh(true);
  }

  async function renderReferrals() {
    const box = $("referrals"); box.replaceChildren(h("h2", {}, "Invite friends"));
    const r = await api("my-referral");
    box.append(h("p", {}, "Your code: ", h("code", {}, r.code)),
      h("p", { class: "muted" }, "You earn 1 GRAD when a friend you invited passes their first course. Rewards unlock 7 days later."),
      h("p", { class: "muted" }, `Invited ${r.stats.registered + r.stats.qualified + r.stats.paid}, qualified ${r.stats.qualified + r.stats.paid}, paid ${r.stats.paid}`));
    if (!walletReady()) return;
    const holder = h("div", {});
    box.append(h("button", { class: "ghost", onclick: (e) => guard(e.target, async () => {
      holder.replaceChildren();
      const res = await api("referral-voucher");
      if (!res.vouchers.length && !res.pending.length) holder.append(h("p", { class: "muted" }, "Nothing to claim yet."));
      for (const p of res.pending) holder.append(h("p", { class: "muted" }, "Unlocks " + new Date(p.claimableAt * 1000).toLocaleDateString()));
      for (const v of res.vouchers) holder.append(h("div", { class: "row" }, h("span", {}, "Friend " + short(v.referee)),
        h("button", { onclick: (ev) => guard(ev.target, async () => {
          const hash = await sendTx(A.encodeClaimReferral(v.referee, v.qualifiedAt, v.deadline, v.signature));
          say("Claimed! ", "ok"); $("msg").append(txLink(hash)); await refresh(true);
        }) }, "Claim 1 GRAD")));
    }) }, "Check referral rewards"), holder);
  }

  async function refresh(keepMsg) {
    if (!keepMsg) say("");
    if (sessionAddr) status = await api("my-status"); else status = { wallet: null, courses: [] };
    $("app").hidden = false;
    await renderWallet();
    if (sessionAddr) { await renderCourses(); await renderReferrals(); }
    else { $("courses").replaceChildren(); $("referrals").replaceChildren(); }
  }

  // ---- start: your existing wallet session (cookie) decides who is signed in ----
  (async () => {
    $("net").textContent = CHAIN.name === "Base Sepolia" ? "Test network: rewards here have no real value." : "";
    try { sessionAddr = await window.GradSiwe.me(); } catch { sessionAddr = null; }
    await restoreWC();
    if (eth()) { try { const a = await eth().request({ method: "eth_accounts" }); account = a[0] || null; } catch { /* not connected yet */ } }
    if (window.ethereum && window.ethereum.on) window.ethereum.on("accountsChanged", (a) => { if (!wcProvider) { account = a[0] || null; refresh(true).catch(() => {}); } });
    await refresh().catch((e) => say(e.message, "err"));
  })();
})();
