// Browser side of your existing wallet sign-in (auth-nonce -> sign -> auth-verify -> httpOnly cookie).
// Used by the rewards page and the admin review page. The session cookie is never readable from JS.
(function (root) {
  "use strict";
  const FN = "/.netlify/functions/";
  const toHex = (s) => "0x" + Array.from(new TextEncoder().encode(s), (b) => b.toString(16).padStart(2, "0")).join("");
  async function parse(res) {
    const j = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(j.error || "Request failed");
    return j;
  }
  const S = {
    toHex,
    async me() { return (await parse(await fetch(FN + "auth-me", { credentials: "same-origin" }))).address || null; },
    async signIn(provider, account) {
      const { message } = await parse(await fetch(FN + "auth-nonce?address=" + encodeURIComponent(account), { credentials: "same-origin" }));
      const signature = await provider.request({ method: "personal_sign", params: [toHex(message), account] });
      const out = await parse(await fetch(FN + "auth-verify", {
        method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address: account, message, signature }),
      }));
      return out.address;
    },
    async signOut() { try { await fetch(FN + "auth-logout", { method: "POST", credentials: "same-origin" }); } catch { /* offline */ } },
  };
  if (typeof module !== "undefined" && module.exports) module.exports = S; else root.GradSiwe = S;
})(typeof window !== "undefined" ? window : globalThis);
