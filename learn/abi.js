// Tiny ABI helpers so the page needs no wallet library. Verified against ethers in test/learn.test.js.
(function (root) {
  "use strict";
  const SEL = { claimCourse: "0x4dece44a", claimReferral: "0x6a363b73", courseClaimed: "0xda2336a8", balanceOf: "0x70a08231" };
  const ERRORS = {
    "0x646cf558": "You already claimed this reward.",
    "0x203d82d8": "This claim link expired. Press the button again to get a fresh one.",
    "0x5cd5d233": "The server signature was rejected. Make sure you are using the wallet linked to your account.",
    "0xa4875a49": "The yearly rewards limit has been reached. Please try again later.",
    "0x17b1f9e3": "Referral rewards unlock 7 days after your friend completes their first course.",
    "0xf8cf87be": "You need a certificate (finish one course) before claiming referral rewards.",
    "0x55e8f70e": "You cannot refer yourself.",
    "0x875281d0": "You reached the yearly referral limit.",
    "0xd93c0665": "Claims are paused for now. Please try again later.",
  };
  const hex = (v) => String(v).replace(/^0x/i, "").toLowerCase();
  const pad = (v) => hex(v).padStart(64, "0");
  const num = (n) => pad(BigInt(n).toString(16));
  const tail = (sig) => {
    const h = hex(sig), len = h.length / 2;
    return num(len) + h.padEnd(Math.ceil(h.length / 64) * 64, "0");
  };
  const A = {
    SEL, ERRORS,
    encodeClaimCourse: (courseId, deadline, sig) => SEL.claimCourse + pad(courseId) + num(deadline) + num(0x60) + tail(sig),
    encodeClaimReferral: (referee, qualifiedAt, deadline, sig) =>
      SEL.claimReferral + pad(referee) + num(qualifiedAt) + num(deadline) + num(0x80) + tail(sig),
    encodeCourseClaimed: (learner, courseId) => SEL.courseClaimed + pad(learner) + pad(courseId),
    encodeBalanceOf: (addr) => SEL.balanceOf + pad(addr),
    formatUnits(hexVal, decimals = 18, places = 2) {
      const v = BigInt(hexVal || "0x0"), base = 10n ** BigInt(decimals);
      const frac = ((v % base) * 10n ** BigInt(places)) / base;
      return (v / base).toString() + (places ? "." + frac.toString().padStart(places, "0") : "");
    },
    friendlyError(err) {
      if (err && (err.code === 4001 || err.code === "ACTION_REJECTED")) return "You cancelled in your wallet.";
      const blob = JSON.stringify(err, Object.getOwnPropertyNames(err || {})).toLowerCase();
      for (const s of Object.keys(ERRORS)) if (blob.includes(s)) return ERRORS[s];
      return (err && err.message) ? String(err.message).slice(0, 160) : "Something went wrong.";
    },
  };
  if (typeof module !== "undefined" && module.exports) module.exports = A; else root.GradAbi = A;
})(typeof window !== "undefined" ? window : globalThis);
