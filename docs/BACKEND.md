# GradToken rewards backend (Netlify functions + Supabase)

Built to sit inside your existing site and use **your wallet sign-in**: the learner signs a message, `auth-verify` sets the httpOnly `gt_session` cookie, and `_shared/session.js` tells every function who is calling. A user's id here **is their lowercase wallet address**, the same key as `users.wallet_address`. There is no email, no Supabase Auth and no link-wallet step.

## Set up
1. Copy `netlify/functions/*` into your site's `netlify/functions/` (the `_lib/` folder sits next to your `_shared/`). Add `ethers` v6 and `@supabase/supabase-js` to dependencies if they are not there.
2. In the Supabase SQL editor run `supabase/migration.sql`, then `supabase/migration-002-review.sql`. Both need your own `schema.sql` applied first (they reference `users`).
3. Set the Netlify variables from `.env.example`. **Admins are wallets**: put your admin wallet address(es), lowercase and comma separated, in `ADMIN_WALLETS`.
4. Copy `js/gt-siwe.js` to your site's `js/` folder (shared sign-in helper for the rewards and admin pages).
5. Add the header rules from `netlify-headers.example.toml` to `netlify.toml`.

## Functions (all POST, same-origin, cookie session)
| Function | Who | Does |
|---|---|---|
| `my-status` | learner | The signed-in wallet and the state of every course. |
| `my-referral` | learner | Referral code and counts. |
| `register-referral` | learner | `{code}` locks the referrer. Only before the first completed course. No self-referral. |
| `claim-voucher` | learner | `{courseId}` returns an EIP-712 voucher for `claimCourseReward`. Only if the completion is recorded. |
| `referral-voucher` | learner | Vouchers for `claimReferral` (hold passed, not flagged, not paid). Needs a certificate. |
| `submit-work`, `my-submissions` | learner | Queue a capstone or free-response exam for review and see its status. |
| `admin-queue`, `admin-review`, `admin-course-status`, `admin-set-component`, `admin-finalize` | **admin** | The review screen: rubric scoring, component checklist, and finalizing a course (records the completion and mints the certificate record). |
| `record-component` | exam backend | Records a component graded elsewhere (needs the `INTERNAL_SECRET` header). |
| `mark-course-passed` | **admin** | Override path to complete a course directly. |

Only a row in `gt_completions` unlocks a reward. It is written by finalize or the override, never by the browser.

## Pages
- `learn/` rewards page: connect a wallet (browser wallet, in-app wallet browser, or WalletConnect), sign in with it, claim course and referral rewards.
- `admin/` review screen: connect an admin wallet and sign in.
- `verify/` public certificate page (no login, reads the chain).
Fill the constants at the top of `learn/rewards.js` and `verify/verify.js` (contract addresses from `deployments/baseSepolia.json`, and your Reown project id for WalletConnect).

## Security notes
- The session cookie is `SameSite=Strict` and host-only, so these pages must be served from **the same host** as the rest of the site. A separate `*.netlify.app` subdomain will not receive the cookie.
- Per-path header rules replace the global one for those paths, so each rule restates all headers. Verify with `curl -sI` after deploying.
- Test that `Cross-Origin-Opener-Policy: same-origin` does not break wallet pop-ups on your target wallets.
- The two hot keys (voucher signer and certificate minter) hold no funds beyond gas. Rotate them if either leaks (`setVoucherSigner` on the rewards contract; revoke `MINTER_ROLE` on the certificate).

## Not yet connected
Your existing `submission-create` / `exam-grade` write to `submissions` and `exam_attempts`; this review flow uses its own `gt_*` tables. Until they are joined, call `record-component` (or the admin screen) to record exam and capstone results. Joining them is the next step.
