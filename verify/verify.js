(() => {
  "use strict";
  // ---- Fill these in after deploy (values from deployments/<network>.json) ----
  const CERT = "0xCERTIFICATE_ADDRESS";
  const CHAIN = { rpc: "https://sepolia.base.org", explorer: "https://sepolia.basescan.org", testnet: true };

  const V = window.GradVerify, $ = (id) => document.getElementById(id);
  function h(tag, props, ...kids) {  // textContent only, nothing from the chain is ever treated as HTML
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(props || {})) if (v != null) el.setAttribute(k, v);
    for (const k of kids.flat()) if (k != null) el.append(k.nodeType ? k : document.createTextNode(String(k)));
    return el;
  }
  const say = (t, cls) => { const m = $("msg"); m.hidden = !t; m.textContent = t || ""; m.className = cls || ""; };
  const short = (a) => a.slice(0, 6) + "..." + a.slice(-4);

  async function lookup(addr) {
    say("Checking..."); $("result").hidden = true;
    let data;
    try {
      const res = await fetch(CHAIN.rpc, { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_call", params: [{ to: CERT, data: V.tokenUriCall(addr) }, "latest"] }) });
      data = await res.json();
    } catch { return say("Could not reach the network. Please try again.", "err"); }
    if (data.error || !data.result || data.result === "0x") return say("No certificate found for this wallet.", "err");

    let cert;
    try { cert = V.parseCertificate(V.decodeString(data.result)); } catch { return say("Could not read this certificate.", "err"); }
    say("");
    const link = location.origin + location.pathname + "?a=" + addr;
    const box = $("result"); box.replaceChildren(
      h("h2", { class: "ok" }, "Verified: " + cert.total + (cert.total === 1 ? " course" : " courses")),
      h("p", { class: "muted" }, "Wallet ", h("code", {}, addr), CHAIN.testnet ? " (test network, no real value)" : ""),
      ...cert.courses.map((c) => h("div", { class: "course" }, h("strong", {}, c.title),
        h("div", { class: "muted" }, "Issued " + new Date(c.issuedAt * 1000).toLocaleDateString() + " by " + short(c.issuer)))),
      h("button", { class: "ghost", type: "button", id: "copy" }, "Copy link"),
      h("a", { class: "btn ghost", target: "_blank", rel: "noopener", href: "https://www.linkedin.com/sharing/share-offsite/?url=" + encodeURIComponent(link) }, "Share on LinkedIn"),
      h("a", { class: "btn ghost", target: "_blank", rel: "noopener", href: "https://twitter.com/intent/tweet?text=" + encodeURIComponent("I completed a course on GradToken, verified on-chain:") + "&url=" + encodeURIComponent(link) }, "Share on X"),
      h("a", { class: "btn ghost", target: "_blank", rel: "noopener", href: CHAIN.explorer + "/token/" + CERT + "?a=" + BigInt(addr).toString() }, "View on blockchain explorer"));
    box.hidden = false;
    $("copy").addEventListener("click", async (e) => {
      try { await navigator.clipboard.writeText(link); e.target.textContent = "Copied"; } catch { e.target.textContent = link; }
    });
  }

  $("form").addEventListener("submit", (e) => {
    e.preventDefault();
    const addr = $("addr").value.trim();
    if (!V.isAddress(addr)) return say("Enter a valid wallet address starting with 0x.", "err");
    history.replaceState(null, "", "?a=" + addr);
    lookup(addr);
  });
  const q = new URLSearchParams(location.search).get("a");
  if (q) { $("addr").value = q; if (V.isAddress(q)) lookup(q); else say("That link has an invalid address.", "err"); }
})();
