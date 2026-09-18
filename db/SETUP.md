# Phase 2 backend setup

Five things to do before this deploys and works. None of them are code —
they're account/dashboard steps only you can do.

## 1. Create a Supabase project

1. https://supabase.com → New project (free tier is plenty for this stage).
2. Once it's up: **SQL Editor** → paste the contents of `db/schema.sql` → Run.
3. **Project Settings → API** → copy:
   - `Project URL` → this is `SUPABASE_URL`
   - `service_role` key (NOT the `anon` key — the service role key is
     required here since Functions bypass RLS deliberately; see schema.sql
     notes) → this is `SUPABASE_SERVICE_ROLE_KEY`

## 2. Generate a session secret

Run locally, don't reuse anything else:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

That output is `SESSION_SECRET`.

## 3. Set Netlify environment variables

Netlify dashboard → Site settings → Environment variables → add:

| Key | Value |
|---|---|
| `SUPABASE_URL` | from step 1 |
| `SUPABASE_SERVICE_ROLE_KEY` | from step 1 |
| `SESSION_SECRET` | from step 2 |
| `SEPOLIA_RPC_URL` | same Alchemy URL already in your local `.env` |
| `ETHERSCAN_API_KEY` | same key already in your local `.env` |
| `GRAD_TOKEN_ADDRESS` | `0x95A69bcbF176497241887f9CcFd8EcBC4e596587` (current) |
| `GRAD_STAKING_ADDRESS` | `0x6B24Ec9dA2f510DF0B2d8dFCd6788F00Cb84dFeD` (current) |
| `GRAD_CERTIFICATE_ADDRESS` | `0xD338F85880716c3d03039798254211be596189C0` |
| `SITE_DOMAIN` | `gradtoken.netlify.app` (or your custom domain, no `https://`) |

If contracts ever get redeployed again, update the three address vars
here — nothing in the function code needs to change.

## 4. Install the new dependencies

```bash
npm install
```

(`package.json` already lists the new packages — see below.)

## 5. Deploy and smoke-test

After `git push` and a Netlify deploy finishes, test in order:

```
curl "https://gradtoken.netlify.app/.netlify/functions/auth-nonce?address=0xYOUR_ADDRESS"
```
Should return a `message` string with a `Nonce:` line.

Then use the "Connect Wallet" button in the site itself (wallet-connect.js
handles nonce → sign → verify automatically) rather than curling the rest
by hand — auth-verify needs a real signature, which curl can't produce.

## What's NOT done yet

- No admin UI for reviewing `submissions` — for now, review rows directly
  in the Supabase table editor and flip `status` to `approved`/`rejected`.
- Certificate **minting** isn't wired up yet — an approved submission
  doesn't automatically call `GradCertificate.issueCertificate()`. That's
  a deliberate next step, not an oversight: minting needs a wallet with
  `MINTER_ROLE` held server-side, which is a bigger key-management
  decision worth its own pass rather than bolting on here.
- Single-use nonce enforcement is time-window-based (5 min expiry), not
  a persisted "already used" list. A stolen nonce token is only replayable
  within that 5-minute window and only for the address it was issued to —
  low risk, but worth knowing it's a simplification, not full SIWE-spec
  replay protection.
