-- GradToken rewards backend tables. All use the gt_ prefix so they do not collide with your existing tables.
-- Users are identified by lowercase wallet address (public.users.wallet_address), the same as your existing tables.
-- Run AFTER your own schema.sql (it needs the users table).
-- RLS is on with NO policies: only the service role key (Netlify functions) can read or write.

-- Authority for rewards: a row with status 'passed' is written ONLY by the admin endpoint
-- (mark-course-passed) after exam + capstone are verified. Never from the browser.
create table if not exists gt_completions (
  id bigint generated always as identity primary key,
  user_id text not null references users(wallet_address) on delete cascade check (user_id = lower(user_id)),
  course_id text not null,
  status text not null default 'passed' check (status in ('passed','revoked')),
  evidence_hash text not null,
  cert_tx text,
  reviewed_by text,
  passed_at timestamptz not null default now(),
  unique (user_id, course_id)
);

create table if not exists gt_referral_codes (
  user_id text primary key references users(wallet_address) on delete cascade,
  code text not null unique
);

create table if not exists gt_referrals (
  referee_id text primary key references users(wallet_address) on delete cascade,
  referrer_id text not null references users(wallet_address) on delete cascade,
  code text not null,
  status text not null default 'registered' check (status in ('registered','qualified','paid','rejected')),
  flagged boolean not null default false,
  registered_at timestamptz not null default now(),
  qualified_at timestamptz,
  check (referee_id <> referrer_id)
);
create index if not exists gt_referrals_referrer_idx on gt_referrals (referrer_id, status);

alter table gt_completions enable row level security;
alter table gt_referral_codes enable row level security;
alter table gt_referrals enable row level security;

-- Admins are wallets, not rows: list your admin wallet addresses (lowercase, comma separated) in the ADMIN_WALLETS Netlify variable.
