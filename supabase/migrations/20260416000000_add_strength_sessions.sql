-- Post-workout session logging (issue #249).
-- Two normalized tables, one row per session and one row per set, both scoped per user via RLS.
-- Named `strength_sessions` / `strength_session_sets` to avoid colliding with the existing
-- `workout_sessions` table, which stores imported Fitbit / manual cardio activity.

create table if not exists strength_sessions (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users(id) on delete cascade,
  workout_plan_id  uuid references workout_plans(id) on delete set null,
  performed_on     date not null,
  started_at       timestamptz,
  completed_at     timestamptz,
  perceived_effort int,
  notes            text,
  created_at       timestamptz not null default now(),
  constraint strength_sessions_perceived_effort_range
    check (perceived_effort is null or perceived_effort between 1 and 10)
);

create index if not exists strength_sessions_user_perf_idx
  on strength_sessions (user_id, performed_on desc);

create table if not exists strength_session_sets (
  id             uuid primary key default gen_random_uuid(),
  session_id     uuid not null references strength_sessions(id) on delete cascade,
  exercise_name  text not null,
  exercise_order int not null,
  set_number     int not null,
  weight_kg      numeric,
  reps           int,
  rpe            numeric,
  completed      boolean not null default true,
  notes          text,
  created_at     timestamptz not null default now(),
  constraint strength_session_sets_rpe_range
    check (rpe is null or (rpe >= 1 and rpe <= 10))
);

create index if not exists strength_session_sets_session_idx
  on strength_session_sets (session_id, exercise_order, set_number);
create index if not exists strength_session_sets_exercise_idx
  on strength_session_sets (exercise_name);

alter table strength_sessions      enable row level security;
alter table strength_session_sets  enable row level security;

drop policy if exists "users manage own strength sessions" on strength_sessions;
create policy "users manage own strength sessions"
  on strength_sessions for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "users manage own strength session sets" on strength_session_sets;
create policy "users manage own strength session sets"
  on strength_session_sets for all to authenticated
  using (
    exists (
      select 1 from strength_sessions s
      where s.id = strength_session_sets.session_id
        and s.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from strength_sessions s
      where s.id = strength_session_sets.session_id
        and s.user_id = auth.uid()
    )
  );
