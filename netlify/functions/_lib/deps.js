// Real dependencies, built lazily at request time so tests can inject fakes instead.
// Reuses your existing _shared helpers: the Supabase client and the wallet session cookie.
const { ethers } = require("ethers");

const need = (k) => { if (!process.env[k]) throw new Error(`Missing env ${k}`); return process.env[k]; };

const CERT_ABI = [
  "function issueCourse(address learner, bytes32 courseId, bytes32 evidence)",
  "function hasCourse(address learner, bytes32 courseId) view returns (bool)",
  "function balanceOf(address owner) view returns (uint256)",
];
const REWARDS_ABI = ["function refereePaid(address referee) view returns (bool)"];

function realDeps() {
  const { getSupabase } = require("../_shared/supabase");
  const { getSessionAddress } = require("../_shared/session");
  const { authFromEvent } = require("./wallet-auth");

  const chainId = Number(need("BASE_CHAIN_ID"));
  const provider = new ethers.JsonRpcProvider(need("BASE_RPC_URL"), chainId);
  const signer = new ethers.Wallet(need("VOUCHER_SIGNER_KEY"));
  const minter = new ethers.Wallet(need("CERTIFICATE_MINTER_KEY"), provider);
  const rewardsAddress = ethers.getAddress(need("REWARDS_ADDRESS"));
  const cert = new ethers.Contract(ethers.getAddress(need("CERTIFICATE_ADDRESS")), CERT_ABI, minter);
  const rewards = new ethers.Contract(rewardsAddress, REWARDS_ABI, provider);

  return {
    db: require("./db").makeDb(getSupabase()),
    signer,
    internalSecret: process.env.INTERNAL_SECRET || null,
    now: () => Math.floor(Date.now() / 1000),
    async auth(event) { return authFromEvent(event, { getSessionAddress, adminWallets: process.env.ADMIN_WALLETS }); },
    chain: {
      chainId,
      rewardsAddress,
      hasCourse: (learner, courseId) => cert.hasCourse(learner, courseId),
      hasCertificate: async (addr) => (await cert.balanceOf(addr)) > 0n,
      refereePaid: (addr) => rewards.refereePaid(addr),
      async mint(learner, courseId, evidence) {
        const tx = await cert.issueCourse(learner, courseId, evidence);
        return (await tx.wait()).hash;
      },
    },
  };
}
module.exports = { realDeps };
