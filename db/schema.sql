-- GradToken Phase 2 schema.
-- Run this once in the Supabase SQL editor for a new project.
--
-- Design notes:
-- * wallet_address is always stored lowercase (functions normalize before
--   writing) so lookups never fail on casing mismatches.
-- * All access from the browser goes through Netlify Functions using the
--   service role key, which bypasses RLS. RLS is enabled anyway as a
--   second layer, denying all direct access by default — if a bug ever
--   let an anon-key request through, it still finds nothing.

create table if not exists users (
  wallet_address text primary key,
  created_at timestamptz not null default now(),
  last_login_at timestamptz
);

create table if not exists course_progress (
  id bigint generated always as identity primary key,
  wallet_address text not null references users(wallet_address),
  course_slug text not null,
  lesson_slug text not null,
  status text not null check (status in ('in_progress', 'completed')),
  completed_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (wallet_address, course_slug, lesson_slug)
);

create table if not exists submissions (
  id bigint generated always as identity primary key,
  wallet_address text not null references users(wallet_address),
  course_slug text not null,
  contract_address text not null,
  rationale text not null,
  contract_verified boolean not null default false,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  submitted_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewer_note text
);

create table if not exists certificates (
  id bigint generated always as identity primary key,
  wallet_address text not null references users(wallet_address),
  course_slug text not null,
  token_id bigint,
  minted_at timestamptz,
  status text not null default 'eligible' check (status in ('eligible', 'minted', 'revoked')),
  unique (wallet_address, course_slug)
);

-- Second layer of defense: deny everything by default. Functions use the
-- service role key and bypass this, but any other access path gets
-- nothing back rather than a permissive default.
alter table users enable row level security;
alter table course_progress enable row level security;
alter table submissions enable row level security;
alter table certificates enable row level security;

create index if not exists idx_progress_wallet on course_progress(wallet_address);
create index if not exists idx_submissions_wallet on submissions(wallet_address);
create index if not exists idx_submissions_status on submissions(status);
create index if not exists idx_certificates_wallet on certificates(wallet_address);
