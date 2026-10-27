// Decided parameters. Addresses come from .env so nothing sensitive lives in git.
module.exports = {
  gradAddress: process.env.GRAD_ADDRESS,
  adminSafe: process.env.ADMIN_SAFE,
  voucherSigner: process.env.VOUCHER_SIGNER,
  certificateMinter: process.env.CERTIFICATE_MINTER,
  communitySafe: process.env.COMMUNITY_SAFE,
  courseReward: "3",          // GRAD per course
  referralReward: "1",        // GRAD per qualified referral
  annualCap: "2000000",       // GRAD, year 1, reviewed yearly
  poolFunding: "300000000",   // GRAD moved from Community Safe to rewards contract
  expectedSupply: "1000000000",
};
