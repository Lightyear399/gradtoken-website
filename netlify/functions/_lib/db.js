const crypto = require("crypto");
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const newCode = () => Array.from(crypto.randomBytes(8), (b) => ALPHABET[b % ALPHABET.length]).join("");

function makeDb(sb) {
  const fail = (error) => { if (error) throw error; };
  const maybe = async (q) => { const { data, error } = await q.maybeSingle(); fail(error); return data; };

  return {
    // Identity is the signed-in wallet itself (lowercase address), so there is nothing to look up or link.
    async getWallet(userId) { return userId; },
    async listCompletions(userId) {
      const { data, error } = await sb.from("gt_completions").select("course_id,status,cert_tx").eq("user_id", userId);
      fail(error); return data || [];
    },
    getCompletion: (userId, courseId) =>
      maybe(sb.from("gt_completions").select("*").eq("user_id", userId).eq("course_id", courseId)),
    async insertCompletion(userId, courseId, evidenceHash, reviewerId) {
      const { data, error } = await sb.from("gt_completions")
        .insert({ user_id: userId, course_id: courseId, evidence_hash: evidenceHash, reviewed_by: reviewerId })
        .select().single();
      fail(error);
      return data;
    },
    async setCertTx(userId, courseId, tx) {
      fail((await sb.from("gt_completions").update({ cert_tx: tx }).eq("user_id", userId).eq("course_id", courseId)).error);
    },
    async countCompletions(userId) {
      const { count, error } = await sb.from("gt_completions")
        .select("id", { count: "exact", head: true }).eq("user_id", userId).eq("status", "passed");
      fail(error);
      return count || 0;
    },
    async ensureCode(userId) {
      const existing = await maybe(sb.from("gt_referral_codes").select("code").eq("user_id", userId));
      if (existing) return existing.code;
      for (let i = 0; i < 5; i++) {
        const code = newCode();
        const { error } = await sb.from("gt_referral_codes").insert({ user_id: userId, code });
        if (!error) return code;
        if (error.code !== "23505") throw error;
        const again = await maybe(sb.from("gt_referral_codes").select("code").eq("user_id", userId));
        if (again) return again.code;
      }
      throw new Error("Could not allocate referral code");
    },
    async findUserByCode(code) {
      const r = await maybe(sb.from("gt_referral_codes").select("user_id").eq("code", code));
      return r ? r.user_id : null;
    },
    getReferralByReferee: (refereeId) => maybe(sb.from("gt_referrals").select("*").eq("referee_id", refereeId)),
    async insertReferral(refereeId, referrerId, code) {
      fail((await sb.from("gt_referrals").insert({ referee_id: refereeId, referrer_id: referrerId, code })).error);
    },
    async qualifyReferral(refereeId, flagged) {
      fail((await sb.from("gt_referrals")
        .update({ status: "qualified", flagged, qualified_at: new Date().toISOString() })
        .eq("referee_id", refereeId).eq("status", "registered")).error);
    },
    async countQualifiedSince(referrerId, sinceIso) {
      const { count, error } = await sb.from("gt_referrals").select("referee_id", { count: "exact", head: true })
        .eq("referrer_id", referrerId).gte("qualified_at", sinceIso);
      fail(error);
      return count || 0;
    },
    async listReferralsForReferrer(referrerId, limit) {
      const { data, error } = await sb.from("gt_referrals").select("referee_id,qualified_at")
        .eq("referrer_id", referrerId).eq("status", "qualified").eq("flagged", false)
        .order("qualified_at", { ascending: true }).limit(limit);
      fail(error);
      return data || [];
    },
    async markReferralPaid(refereeId) {
      fail((await sb.from("gt_referrals").update({ status: "paid" }).eq("referee_id", refereeId)).error);
    },
    // ---- submissions and component results (review flow)
    async insertSubmission(row) {
      const { data, error } = await sb.from("gt_submissions").insert(row).select("id").single();
      if (error) {
        if (error.code === "23505") { const e = new Error("active submission exists"); e.code = "active_exists"; throw e; }
        throw error;
      }
      return data.id;
    },
    getSubmission: (id) => maybe(sb.from("gt_submissions").select("*").eq("id", id)),
    async listSubmissions({ status, courseId, limit }) {
      let q = sb.from("gt_submissions").select("*").eq("status", status);
      if (courseId) q = q.eq("course_id", courseId);
      const { data, error } = await q.order("submitted_at", { ascending: status === "pending" }).limit(limit);
      fail(error);
      return data || [];
    },
    async listSubmissionsForUser(userId) {
      const { data, error } = await sb.from("gt_submissions")
        .select("id,course_id,component,status,feedback,score_pct,submitted_at,reviewed_at")
        .eq("user_id", userId).order("submitted_at", { ascending: false }).limit(50);
      fail(error);
      return data || [];
    },
    async hasActiveSubmission(userId, courseId, component) {
      const { count, error } = await sb.from("gt_submissions").select("id", { count: "exact", head: true })
        .eq("user_id", userId).eq("course_id", courseId).eq("component", component).in("status", ["pending", "approved"]);
      fail(error);
      return (count || 0) > 0;
    },
    async updateSubmission(id, fields) { fail((await sb.from("gt_submissions").update(fields).eq("id", id)).error); },
    latestApprovedSubmission: (userId, courseId, component) =>
      maybe(sb.from("gt_submissions").select("*").eq("user_id", userId).eq("course_id", courseId)
        .eq("component", component).eq("status", "approved").order("submitted_at", { ascending: false }).limit(1)),
    async upsertComponent(row) {
      fail((await sb.from("gt_component_results").upsert({
        user_id: row.userId, course_id: row.courseId, component: row.component, passed: row.passed,
        score: row.score ?? null, source: row.source, note: row.note ?? null, recorded_at: new Date().toISOString(),
      }, { onConflict: "user_id,course_id,component" })).error);
    },
    async listComponents(userId, courseId) {
      const { data, error } = await sb.from("gt_component_results").select("*").eq("user_id", userId).eq("course_id", courseId);
      fail(error);
      return data || [];
    },
    async getUserEmail() { return null; },
    async referralStats(referrerId) {
      const { data, error } = await sb.from("gt_referrals").select("status,flagged").eq("referrer_id", referrerId);
      fail(error);
      const s = { registered: 0, qualified: 0, paid: 0, underReview: 0 };
      for (const r of data || []) { if (s[r.status] !== undefined) s[r.status]++; if (r.flagged) s.underReview++; }
      return s;
    },
  };
}
module.exports = { makeDb };
