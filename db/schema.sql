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
  repo_url text,
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

-- Final-exam question bank. Structure only — this table holds NO question
-- content by default. The actual questions, correct answers and rubrics
-- are sensitive (they're the answer key) and are seeded separately, by
-- hand, from a file that is never committed to this repo. See
-- db/SETUP.md and the private seed file for how that works.
--
-- format drives how exam-grade.js scores an answer:
--   multiple_choice — options + correct_option_id, fully auto-gradable
--   short_result    — expected_result is auto-checked for partial credit
--                      (the "correct result" half of the mark); the
--                      accompanying reasoning is always human-reviewed
--   free_response   — no auto-grading at all; entirely human-reviewed
--                      (conceptual partial credit, debugging, practical)
--
-- tags is a jsonb array used by the assembly rules in
-- netlify/functions/_shared/exam.js (e.g. ["security_bug"],
-- ["compile_error"], ["storage_memory"]) to guarantee category coverage
-- when a random set is drawn. mission is null for course-wide items
-- (Section D practical tasks aren't tied to one mission).
create table if not exists exam_questions (
  id bigint generated always as identity primary key,
  course_slug text not null,
  section text not null check (section in ('A', 'B', 'C', 'D')),
  mission text,
  format text not null check (format in ('multiple_choice', 'short_result', 'free_response')),
  points integer not null,
  prompt text not null,
  options jsonb,
  correct_option_id text,
  expected_result text,
  rubric jsonb,
  reference_answer text,
  tags jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

-- One row per exam attempt. question_ids is the specific random draw for
-- THIS attempt (assembled once at exam-generate time and never
-- reassembled), so refreshing the page mid-exam doesn't hand the student
-- a fresh set of questions and a reset clock.
--
-- Scoring is split deliberately: auto_score/max_auto_score are what
-- exam-grade.js can determine mechanically at submission time.
-- final_score and passed are only set once a human has reviewed the
-- free_response and short_result-reasoning portions (see db/SETUP.md —
-- there's no review UI yet, so this happens in the Supabase table
-- editor, same as submissions.status today).
create table if not exists exam_attempts (
  id bigint generated always as identity primary key,
  wallet_address text not null references users(wallet_address),
  course_slug text not null,
  question_ids jsonb not null,
  started_at timestamptz not null default now(),
  expires_at timestamptz not null,
  submitted_at timestamptz,
  answers jsonb,
  auto_score integer,
  max_auto_score integer,
  total_points integer not null,
  status text not null default 'in_progress' check (status in ('in_progress', 'submitted', 'graded', 'expired')),
  final_score integer,
  passed boolean,
  reviewed_at timestamptz,
  reviewer_note text
);

-- A wallet can only have one exam attempt in flight per course at a time —
-- stops "open a second tab, get a fresh 90 minutes" clock resets.
create unique index if not exists idx_one_active_attempt
  on exam_attempts(wallet_address, course_slug)
  where status = 'in_progress';

-- Second layer of defense: deny everything by default. Functions use the
-- service role key and bypass this, but any other access path gets
-- nothing back rather than a permissive default.
alter table users enable row level security;
alter table course_progress enable row level security;
alter table submissions enable row level security;
alter table certificates enable row level security;
alter table exam_questions enable row level security;
alter table exam_attempts enable row level security;

create index if not exists idx_progress_wallet on course_progress(wallet_address);
create index if not exists idx_submissions_wallet on submissions(wallet_address);
create index if not exists idx_submissions_status on submissions(status);
create index if not exists idx_certificates_wallet on certificates(wallet_address);
create index if not exists idx_exam_questions_course_section on exam_questions(course_slug, section);
create index if not exists idx_exam_attempts_wallet on exam_attempts(wallet_address);
create index if not exists idx_exam_attempts_status on exam_attempts(status);
