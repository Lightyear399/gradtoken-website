# GradToken drop-in package v2: START HERE

Unzip over the **root of your gradtoken repo**. This version uses **your wallet sign-in** (nonce, signature, httpOnly cookie). It was tested inside a copy of your repo, with your own `netlify/functions/_shared/session.js`: 93 tests pass, plus 7 PWA tests.

## 0. Security first
- The old deployer key was exposed in `.env.example`: treat it as compromised, never fund or reuse it, rotate the Alchemy key. Never commit `.env`.
- This package's `.env.example` is your current one plus the new variables, with placeholders only.

## 1. Files that need a manual merge (this package does NOT overwrite them)
- `package.json`: see `docs/merge/package.additions.md`
- `hardhat.config.js`: see `docs/merge/hardhat.config.additions.js`
- `netlify.toml`: add the two rules in `docs/netlify-headers.example.toml` BELOW your existing `/*` rule
- `service-worker.js` and every page's `<head>`: see `docs/PWA-INTEGRATION.md`
`.env.example` is overwritten (it is your own file plus the new variables). Everything else is new files. If a file with the same name already exists in `netlify/functions/`, stop and compare.

## 2. Install and test
```
npm install
npm test          # your tests plus the new ones
npm run test:pwa
```

## 3. Supabase (your existing schema stays)
1. Your `schema.sql` is already applied. Do not touch your tables.
2. Run `supabase/migration.sql`, then `supabase/migration-002-review.sql` in the SQL editor. They add `gt_*` tables keyed by wallet address.
3. Netlify variables: see `netlify-env.example` (`BASE_RPC_URL`, `BASE_CHAIN_ID`, contract addresses, the two hot keys, `INTERNAL_SECRET`, and **`ADMIN_WALLETS`** = your admin wallet addresses, lowercase, comma separated).

## 4. Fix the live pages
`python3 tools/fix-site.py` (dry run), then `--apply`. Then edit the vesting text on `tokenomics.html` by hand: Team 12 + 36, Investors 12 + 24, Advisors 6 + 18.

## 5. Constants to fill in
`learn/rewards.js` (contract addresses, WalletConnect project id) and `verify/verify.js` (certificate address). The rewards and admin pages must be served from your **same site host**, because your session cookie is host-only.

## 6. Deploy to Base Sepolia (rehearsal)
1. Five Safes and a fresh deployer wallet, then fill `.env`.
2. `npm run deploy:token-suite:base-sepolia`
3. `npm run deploy:core:base-sepolia`
4. From the Community Safe send 300,000,000 GRAD to the rewards contract.
5. `npm run check:core:base-sepolia`, then the `hardhat verify` commands the scripts print.
6. Rehearse end to end (`docs/DEPLOYMENT.md`). Mainnet only after the legal opinion and the audit.

## 7. Commit
```
git add contracts scripts test tests-node netlify learn verify admin supabase docs tools icons js manifest.webmanifest offline.html pwa.css deploy.config.js .env.example netlify-env.example package.json hardhat.config.js netlify.toml
git add deployments/*.json   # addresses only, after deploying
git status                   # confirm .env is NOT listed
```

## Not done yet
Your existing `exam-grade` and `submission-create` write to `exam_attempts` and `submissions`; the new review flow uses its own tables. Until they are joined, record results with the admin screen or `record-component`. Check also that `submission-create` still works: it calls Etherscan's old V1 API, which Etherscan has been retiring.
