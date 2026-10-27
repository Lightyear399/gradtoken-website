// POST {} -> vouchers for GradRewards.claimReferral, one per qualified referee whose 7-day hold has passed.
const { HttpError, run } = require("./_lib/http");
const { VOUCHER_TTL_SECONDS, HOLD_SECONDS, MAX_VOUCHERS_PER_REQUEST } = require("./_lib/config");
const { signReferral } = require("./_lib/vouchers");

const createHandler = (deps) => (event) => run(event, async () => {
  const user = await deps.auth(event);
  const wallet = await deps.db.getWallet(user.id);
  if (!wallet) throw new HttpError(409, "Link a wallet first");
  if (!(await deps.chain.hasCertificate(wallet))) throw new HttpError(403, "Finish a course and mint your certificate first");

  const ctx = { chainId: deps.chain.chainId, verifyingContract: deps.chain.rewardsAddress };
  const now = deps.now();
  const deadline = now + VOUCHER_TTL_SECONDS;
  const vouchers = [];
  const pending = [];

  for (const row of await deps.db.listReferralsForReferrer(user.id, MAX_VOUCHERS_PER_REQUEST)) {
    const referee = await deps.db.getWallet(row.referee_id);
    if (!referee) continue;
    if (await deps.chain.refereePaid(referee)) { await deps.db.markReferralPaid(row.referee_id); continue; }
    const qualifiedAt = Math.floor(new Date(row.qualified_at).getTime() / 1000);
    const claimableAt = qualifiedAt + HOLD_SECONDS;
    if (now < claimableAt) { pending.push({ claimableAt }); continue; }
    const signature = await signReferral(deps.signer, ctx, wallet, referee, qualifiedAt, deadline);
    vouchers.push({ referee, qualifiedAt, deadline, signature });
  }
  return { rewards: deps.chain.rewardsAddress, chainId: deps.chain.chainId, vouchers, pending };
});

exports.createHandler = createHandler;
exports.handler = (event) => createHandler(require("./_lib/deps").realDeps())(event);
