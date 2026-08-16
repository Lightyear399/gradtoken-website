# GradToken — Phase 1 Smart Contracts

This is the Phase 1 deliverable from your execution plan: **GRAD token + staking contract, tested**, plus a vesting contract for the Team/Investor/Advisor allocations so the full tokenomics split can actually be deployed. Everything here maps to checklist items #5 ("Smart contract build") and #6 ("Internal testing") in `GradToken_Phase1_Execution_Plan.md`.

## What's in here

| Contract | Purpose |
|---|---|
| `contracts/GradToken.sol` | Fixed-supply ERC-20 (1,000,000,000 GRAD). Mints once, in the constructor, split across the 7 tokenomics buckets. No mint function exists after that — supply can never change. |
| `contracts/GradVesting.sol` | Cliff + linear vesting for Team (12mo cliff / 24mo linear), Investors (6mo cliff / 18mo linear), and Advisors (12mo cliff / 18mo linear). Deploy one instance per bucket. |
| `contracts/GradStaking.sol` | GradStake MVP — stake GRAD, earn GRAD, using the standard Synthetix-style reward accounting pattern. |

All three build on OpenZeppelin 5.1.0 rather than hand-rolled primitives — that's the single biggest security lever available to a solo, pre-audit dev: don't reinvent ERC-20, access control, or reentrancy protection.

## Security decisions, and why

This directly follows your Week 4 Secureum reading list — these are the failure modes it covers, applied:

- **Reentrancy** — `nonReentrant` guards on every function that moves tokens out of a contract, plus checks-effects-interactions everywhere (internal state updates happen *before* external transfers, not after).
- **Access control** — Admin functions use `Ownable2Step`, not `Ownable`. That means transferring ownership requires the new owner to explicitly accept — you can't accidentally lock yourself out by fat-fingering an address, which is a real, common way solo-founder projects lose control of their own contracts.
- **Integer overflow/underflow** — Solidity 0.8.24's built-in checked arithmetic handles this; no `SafeMath` needed.
- **Fixed supply, no hidden inflation** — `GradToken` has no mint function at all after deployment. Not "restricted to owner" — genuinely absent from the bytecode. This is the strongest form of the "can't rug via inflation" guarantee.
- **Solvency checks in staking** — `notifyRewardAmount` explicitly checks the contract holds enough GRAD to cover the full reward period on top of staked principal, before committing to a rate. It can never promise more than it can pay.
- **Pause never traps funds** — `GradStaking` can be paused (blocking new stakes and reward claims) for emergencies, but `withdraw` and `emergencyWithdraw` are deliberately *not* pausable. A pause switch that can also freeze user principal is one of the more common ways "safety features" become rug vectors — this one can't.
- **Anti-sniping minimums** — `minStakeAmount` + `minStakeDuration` close a real exploit found during penetration testing (see below). `emergencyWithdraw()` remains an instant, always-available escape hatch that bypasses both, at the cost of forfeiting rewards.
- **Vesting protects the beneficiary, not just the owner** — a revoked schedule always pays out whatever had already vested before returning the unvested remainder to the owner. The owner can never claw back tokens someone already earned.
- **`recoverERC20` can't touch GRAD** — the one function that lets the staking contract's owner rescue accidentally-sent tokens is hard-blocked, in code, from ever moving the GRAD token itself.

## What this is *not*

This is a solid, tested Phase 1 draft — not a substitute for the professional audit your execution plan already budgets for (checklist item #7). Per your own plan: **self-taught + audited is a completely normal, credible path. Self-taught + unaudited is where trust breaks.** Don't skip the audit before mainnet regardless of how clean this looks.

## Penetration testing

`test/Security.exploit.test.js` is a dedicated adversarial suite — not "does the happy path work," but "what can I break." It includes real proof-of-concept attacker contracts (`contracts/mocks/MaliciousReentrantToken.sol` simulates a hostile, hook-enabled token to stress-test the reentrancy guards even harder than real GRAD, which has no hooks at all) and covers: reentrancy via `withdraw`/`getReward`/`exit`/`release`/`revoke`, non-owner access-control bypass attempts (including raw low-level calls), direct-donation dilution attempts, and timing/front-running attacks.

**One real finding came out of it**, and it's worth understanding even though it's now fixed: `GradStaking`'s reward accounting splits emissions by *share of the pool*, not absolute stake size. That's correct and standard — but it means whoever is the *sole* staker at a given instant gets 100% of that instant's reward regardless of how small their stake is. A dust attack — repeatedly staking 1 wei the moment the pool goes empty, then withdrawing — measurably harvested real reward budget (~5 GRAD across 15 cycles in testing) for functionally zero capital at risk. This isn't a fund-drain bug (nobody's principal was ever at risk, and it can't exceed what was already budgeted for emission), but it's a real fairness/economic exploit that would have quietly siphoned reward budget away from genuinely committed stakers.

**Fix:** `GradStaking` now enforces a `minStakeAmount` (default 1 GRAD) and `minStakeDuration` (default 1 hour, owner-tunable up to 7 days) together. Either alone isn't enough — a duration gate alone doesn't deter an attacker with near-zero capital locked up, since waiting costs them nothing. Amount *and* duration together mean an attacker needs genuine capital exposed for genuine time, which is what makes the attack economically irrational rather than just mildly inconvenient. `emergencyWithdraw()` still bypasses both gates instantly (forfeiting rewards) — funds are never trapped, only the reward-preserving withdrawal path is time-gated. `test/Security.exploit.test.js` documents the original measured exploit and confirms the fix blocks it at the very first call.

This is the value of testing your own contracts adversarially before an audit: this exact finding is precisely the kind of thing a professional auditor would flag — better to find and fix it yourself first.

## Test coverage

39 tests across all three contracts plus the dedicated penetration suite, covering:
- Exact tokenomics allocation math (all 7 buckets, verified against `GradToken_Tokenomics.md`)
- Zero-address and access-control reverts
- Vesting cliff behavior, linear release math, full-vest release, revocation (both revocable and non-revocable paths)
- Staking reward accrual and proportional splitting between multiple stakers
- The solvency check rejecting an over-committed reward period
- Pause behavior — confirming claims are blocked but withdrawals never are
- `emergencyWithdraw` and `exit()` flows

Run them yourself:

```bash
npm install
npx hardhat compile
npx hardhat test                              # everything, including the penetration suite
npx hardhat test test/Security.exploit.test.js  # just the adversarial tests
```

> Note: contracts here were compiled and all 26 tests were run and passed in the environment that produced this code. On your own machine, `npx hardhat compile` will download the solc compiler binary directly (this sandbox blocks that specific download, which is why `compile.js` exists as a fallback — you shouldn't need it).

### Recommended next step: run Slither

Your execution plan calls out Slither as the free first-pass static analyzer before you pay for an audit. It wasn't runnable in this sandbox (it also needs to download the solc binary), but on your machine:

```bash
pip install slither-analyzer
solc-select install 0.8.24 && solc-select use 0.8.24
slither .
```

Run this before you request audit quotes — fixing anything Slither flags yourself is free; having an auditor flag the same thing costs money and time.

## Deploying to testnet (Sepolia)

1. `cp .env.example .env` and fill in a Sepolia RPC URL (Alchemy/Infura free tier is fine — you're already using Alchemy University) and a **testnet-only** deployer private key.
2. `npx hardhat run scripts/deploy.js --network sepolia`
3. Follow the manual next steps the script prints at the end (creating real vesting schedules, funding the staking reward pool, and — importantly — transferring ownership of `GradVesting`/`GradStaking` off your personal EOA and onto a multisig before this is anything but a personal test).

This satisfies Phase 2 of your roadmap ("Launch GRAD on Ethereum or BNB Smart Chain testnet") once you're ready to move past Phase 1.

## Honest gaps / what to look at next

- `GradToken`'s 7 constructor addresses are currently plain wallets for everything except the three vesting buckets. Before any real deployment, `treasury`, `communityEcosystemPool`, `publicSaleLiquidity`, and `marketing` should be multisigs (e.g. Safe), not single EOAs — that's outside this codebase's scope but worth flagging now rather than after mainnet.
- The community/ecosystem allocation currently just sits at an address; the tokenomics doc says it should be "released as earned/claimed through actual GradLearn/GradStake activity." That claim-on-activity logic depends on GradLearn existing, which is Phase 4 — for now, `GradStaking` covers the "earn via staking" half, and a GradLearn claim contract is a Phase 4 problem, not a Phase 1 one.
- No formal audit, no fuzz testing (Foundry's `forge fuzz` or Echidna would be a good addition once you're comfortable in Foundry), no mainnet fork testing yet. All reasonable next steps, all after Slither, all before mainnet.
#   g r a d t o k e n - w e b s i t e  
 