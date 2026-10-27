// In-memory stand-in for backend/netlify/functions/_lib/db.js
function fakeDb() {
  const s = { wallets: new Map(), nonces: new Map(), completions: [], submissions: [], components: [], codes: new Map(), referrals: new Map() };
  return {
    s,
    async getWallet(u) { return s.wallets.get(u) || null; },
    async linkWallet(u, a) {
      if ([...s.wallets.values()].includes(a)) { const e = new Error("taken"); e.code = "wallet_taken"; throw e; }
      s.wallets.set(u, a);
    },
    async createNonce(u) { const n = "nonce" + s.nonces.size; s.nonces.set(u, n); return n; },
    async consumeNonce(u) { const n = s.nonces.get(u) || null; s.nonces.delete(u); return n; },
    async listCompletions(u) { return s.completions.filter((x) => x.user_id === u); },
    async getCompletion(u, c) { return s.completions.find((x) => x.user_id === u && x.course_id === c) || null; },
    async insertCompletion(u, c, h, r) {
      const row = { user_id: u, course_id: c, status: "passed", evidence_hash: h, cert_tx: null, reviewed_by: r };
      s.completions.push(row); return row;
    },
    async setCertTx(u, c, tx) { (await this.getCompletion(u, c)).cert_tx = tx; },
    async countCompletions(u) { return s.completions.filter((x) => x.user_id === u && x.status === "passed").length; },
    async ensureCode(u) { if (!s.codes.has(u)) s.codes.set(u, "CODE" + (s.codes.size + 1) + "XYZ"); return s.codes.get(u); },
    async findUserByCode(c) { for (const [u, code] of s.codes) if (code === c) return u; return null; },
    async getReferralByReferee(r) { return s.referrals.get(r) || null; },
    async insertReferral(referee, referrer, code) {
      s.referrals.set(referee, { referee_id: referee, referrer_id: referrer, code, status: "registered", flagged: false, qualified_at: null });
    },
    async qualifyReferral(referee, flagged) {
      Object.assign(s.referrals.get(referee), { status: "qualified", flagged, qualified_at: new Date(this.clock ? this.clock() : Date.now()).toISOString() });
    },
    async countQualifiedSince(referrer) {
      return [...s.referrals.values()].filter((r) => r.referrer_id === referrer && r.qualified_at).length;
    },
    async listReferralsForReferrer(referrer) {
      return [...s.referrals.values()].filter((r) => r.referrer_id === referrer && r.status === "qualified" && !r.flagged);
    },
    async markReferralPaid(referee) { s.referrals.get(referee).status = "paid"; },
    async insertSubmission(row) {
      if (s.submissions.some((x) => x.user_id === row.user_id && x.course_id === row.course_id && x.component === row.component && ["pending", "approved"].includes(x.status))) {
        const e = new Error("active"); e.code = "active_exists"; throw e;
      }
      const sub = { id: s.submissions.length + 1, status: "pending", submitted_at: new Date().toISOString(), scores: null, score_pct: null, feedback: null, ...row };
      s.submissions.push(sub); return sub.id;
    },
    async getSubmission(id) { return s.submissions.find((x) => x.id === Number(id)) || null; },
    async listSubmissions({ status, courseId }) { return s.submissions.filter((x) => x.status === status && (!courseId || x.course_id === courseId)); },
    async listSubmissionsForUser(u) { return s.submissions.filter((x) => x.user_id === u); },
    async hasActiveSubmission(u, c, comp) { return s.submissions.some((x) => x.user_id === u && x.course_id === c && x.component === comp && ["pending", "approved"].includes(x.status)); },
    async updateSubmission(id, f) { Object.assign(await this.getSubmission(id), f); },
    async latestApprovedSubmission(u, c, comp) { return [...s.submissions].reverse().find((x) => x.user_id === u && x.course_id === c && x.component === comp && x.status === "approved") || null; },
    async upsertComponent(r) {
      s.components = s.components.filter((x) => !(x.user_id === r.userId && x.course_id === r.courseId && x.component === r.component));
      s.components.push({ user_id: r.userId, course_id: r.courseId, component: r.component, passed: r.passed, score: r.score ?? null, source: r.source, note: r.note ?? null });
    },
    async listComponents(u, c) { return s.components.filter((x) => x.user_id === u && x.course_id === c); },
    async getUserEmail(u) { return u + "@test.dev"; },
    async referralStats() { return { registered: 0, qualified: 0, paid: 0, underReview: 0 }; },
  };
}
module.exports = { fakeDb };
