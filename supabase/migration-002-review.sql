-- Review flow tables. Run after migration.sql. RLS on, no policies: service role only.

create table if not exists gt_submissions (
  id bigint generated always as identity primary key,
  user_id text not null references users(wallet_address) on delete cascade check (user_id = lower(user_id)),
  course_id text not null,
  component text not null,
  content text not null,
  repo_url text,
  status text not null default 'pending' check (status in ('pending','approved','rejected','resubmit')),
  scores jsonb,
  score_pct numeric,
  feedback text,
  reviewed_by text,
  reviewed_at timestamptz,
  submitted_at timestamptz not null default now()
);
-- One pending-or-approved submission per learner per component (blocks double submits).
create unique index if not exists gt_submissions_active_idx
  on gt_submissions (user_id, course_id, component) where status in ('pending','approved');
create index if not exists gt_submissions_queue_idx on gt_submissions (status, submitted_at);

-- One row per learner per course component. 'auto' = your exam backend, 'review' = reviewer approval,
-- 'admin' = manual override with a note.
create table if not exists gt_component_results (
  user_id text not null references users(wallet_address) on delete cascade check (user_id = lower(user_id)),
  course_id text not null,
  component text not null,
  passed boolean not null,
  score numeric,
  source text not null check (source in ('auto','admin','review')),
  note text,
  recorded_at timestamptz not null default now(),
  primary key (user_id, course_id, component)
);

alter table gt_submissions enable row level security;
alter table gt_component_results enable row level security;
