# Base Sepolia deployment checklist

Base Sepolia is the rehearsal. Mainnet (Base) only after the legal opinion, the audit and a multisig with 2+ owners.

## 0. Before you start
- [ ] Fresh deployer wallet with Base Sepolia ETH from a faucet. It should hold no roles after deploy.
- [ ] Two separate backend hot keys: voucher signer and certificate minter. Keep both in Netlify env vars only.
- [x] Vesting terms decided: team 12m cliff + 36m linear, investors 12m + 24m, advisors 6m + 18m (mainnet). For the Base Sepolia rehearsal use shortened versions (for example 1-day cliff + 7 days linear) so you can test releases.
- [ ] Confirm the vesting contract releases linearly after the cliff and that the clock starts at launch, not at deployment.

## 1. Safes on Base Sepolia (new addresses, Safes do not carry across chains)
Create each in the Safe app on Base Sepolia:
- [ ] Admin Safe (holds admin on certificate and rewards)
- [ ] Treasury Safe (150M)
- [ ] Community Safe (350M at deploy; 300M later moves to rewards, 50M stays for grants)
- [ ] Marketing Safe (60M)
- [ ] Public Sale Safe (120M placeholder)
Owners: you plus your sister at minimum, threshold 2 of 2 now, 2 of 3 once a third signer is added. Keep one key on a hardware wallet. Record all five addresses.

## 2. Token + vesting (one script, correct order)
```
# .env: ADMIN_SAFE, COMMUNITY_SAFE, TREASURY_SAFE, MARKETING_SAFE, PUBLIC_SALE_SAFE (all different from the deployer)
REHEARSAL=yes npx hardhat run scripts/deploy-token-suite.js --network baseSepolia
```
`REHEARSAL=yes` uses a 1-day cliff + 7 days linear for all three vesting contracts so you can test releases; leave it out for real terms (team 12+36 revocable, investors 12+24, advisors 6+18, last two not revocable). The script predicts the token address, deploys the three `GradLockedVesting` contracts against it, deploys `GradToken` last (it mints each bucket straight to its destination), stops if the address does not match, checks all 7 bucket balances and that the deployer holds nothing, and writes `deployments/baseSepolia-token.json`. Do not use the old `scripts/deploy.js` from your repo: it parks everything on the deployer wallet. Skip GradBridge and GradStaking for launch.

## 3. Certificate + rewards (this project)
```
cp .env.example .env     # fill GRAD_ADDRESS, ADMIN_SAFE, VOUCHER_SIGNER, CERTIFICATE_MINTER, COMMUNITY_SAFE
npm install
npx hardhat run scripts/deploy-core.js --network baseSepolia
```
The script refuses a wrong token (supply must be 1B), refuses if the deployer equals an admin/signer/minter, and writes `deployments/baseSepolia.json`.

## 4. Fund the pool
- [ ] From the Community Safe, send 300,000,000 GRAD to the GradRewards address (2 signers approve).

## 5. Verify and check
```
npx hardhat verify --network baseSepolia <cert> <args>      # printed by the deploy script
npx hardhat verify --network baseSepolia <rewards> <args>
npx hardhat run scripts/check-core.js --network baseSepolia
```
All checks must say OK. If verify fails on the API, update `@nomicfoundation/hardhat-verify`.

## 6. Backend wiring
- [ ] Add env vars: REWARDS_ADDRESS, CERTIFICATE_ADDRESS, CHAIN_ID=84532, VOUCHER_SIGNER_KEY, CERTIFICATE_MINTER_KEY.
- [ ] Sign vouchers only from server-verified exam and capstone results.
- [ ] Mint with `issueCourse(learner, courseId, evidenceHash)` using the same `keccak256("course-slug")` IDs everywhere.

## 7. End-to-end rehearsal
- [ ] One learner completes a course, mints the certificate, claims 3 GRAD.
- [ ] A second learner finishes via a referral link, then after 7 days the referrer claims 1 GRAD.
- [ ] Confirm a repeat claim, a bad signature and an over-cap claim all fail.
- [ ] Open the `tokenURI` of a certificate and check the course list.

## 8. Update the site
- [ ] Replace the Sepolia addresses and Etherscan links on `security.html` and all page footers with the Base Sepolia ones and Basescan links.
- [ ] Add `setImageURI` for the certificate image.

## 9. Mainnet gates (do not skip)
- [ ] Token legal opinion, professional audit covering GradRewards and GradCertificate
- [ ] Safes at 2+ owners with hardware keys
- [ ] Timelock decision on `setAnnualCap`, `setRewards`, `setVoucherSigner`
- [ ] Then `CONFIRM_MAINNET=yes` and repeat steps 3-8 on `--network base`
