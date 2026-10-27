# GradRewards

Claims-only GRAD rewards pool (Solidity 0.8.24, OpenZeppelin 5.1.0). 6 tests pass.

## Rules enforced on-chain
- Course reward: 3 GRAD, once per (learner, course), needs a backend EIP-712 voucher.
- Referral reward: 1 GRAD, once per referee, needs a voucher, a 7-day hold after `qualifiedAt`,
  a certificate held by the referrer, max 20 per referrer per year, no self-referral.
- Yearly emission cap (2M GRAD in year 1) shared by both reward types; a new epoch starts every 365 days from deploy.
- Referral reward can never exceed the course reward (checked in constructor and `setRewards`).
- GRAD can only leave through claims. `recoverERC20` refuses GRAD. Admin can pause.
- The signer can only unlock the fixed amount for a real pair; it cannot choose amounts.

## Not on-chain (backend jobs)
- Verify exam + capstone pass server-side before signing any voucher.
- Flag referrers with more than 5 qualified referrals in 30 days for manual review.
- Track the 3.00 accrual by component (quizzes 0.75 / exam 1.00 / capstone 1.25); only sign the voucher once all pass.

## Deploy (Base Sepolia first)
Constructor args: GRAD, certificate contract, admin (your Safe), voucher signer (hot key),
courseReward (3e18), referralReward (1e18), annualCap (2_000_000e18).
Then send 300M GRAD from the Community Safe to the contract address.

## Backend voucher signing (Netlify function, ethers v6)
```js
const domain = { name: "GradRewards", version: "1", chainId, verifyingContract: REWARDS_ADDRESS };
const types = { CourseClaim: [
  { name: "learner", type: "address" }, { name: "courseId", type: "bytes32" }, { name: "deadline", type: "uint256" } ] };
const sig = await signerWallet.signTypedData(domain, types, { learner, courseId, deadline });
```
Referral: type `ReferralClaim(address referrer,address referee,uint256 qualifiedAt,uint256 deadline)`.
Keep the signer key in a Netlify env var, never in the repo.

## Run tests
`npm install && npx hardhat test`
(Hardhat downloads the 0.8.24 compiler on first run.)

## Before mainnet
Get this contract in the professional audit scope. Consider a timelock on `setAnnualCap`,
`setRewards` and `setVoucherSigner`, since those are the admin powers that move value.

## Backend
See `backend/README.md` for the Netlify functions and Supabase migration. `test/backend.test.js` runs them against the real contracts.

## GradLockedVesting (replaces TeamVesting for the Base deploy)
`contracts/GradLockedVesting.sol`: one instance per group. Cliff and duration are fixed at deploy; nothing vests until the owner sets a launch time (once, never in the past); every schedule starts at launch. Fixes the five risks found in the review of `TeamVesting.sol` (`test/vesting.review.test.js`).
- Deploy args: `(grad, ownerSafe, cliffSeconds, durationSeconds, revocable, clawbackTreasurySafe)`.
- Team 12 + 36 months: `revocable = true` for employees who may leave (clawback goes to the treasury Safe, never the owner). **Founder allocation: use a separate non-revocable instance.**
- Investors 12 + 24 and advisors 6 + 18: `revocable = false`.
- Setup order: fund the contract, `addBeneficiary` for each person (only up to what it holds), `lockSchedules()`, then `setLaunchTime(t)` at launch. `sweepUnallocated()` sends unassigned tokens to the treasury after locking.
- Later hires need their own start date, so give them a new instance instead of adding them here.
- Token and vesting contracts depend on each other's address: compute the token's address from the deployer nonce (`ethers.getCreateAddress({from, nonce})`), deploy the vesting contracts against it, then deploy the token last and assert the address matches. The test `deploy order` shows this.
- Not audited. Include it in the audit scope.
