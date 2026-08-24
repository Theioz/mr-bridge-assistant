-- Recurring tasks — a series row plus generated occurrences (#468).
--
-- WHY A SERIES TABLE, NOT A `repeat_days` COLUMN ON `tasks`
--
-- The obvious cheap shape is an integer `repeat_days` on `tasks`: on completion, insert the next
-- task at due_date + N. It was the original recommendation and it does not survive contact with
-- the actual requirement, which is an END DATE that warns before it expires (#689).
--
-- Roll-forward-on-complete has no series object. There is nothing to hang `ends_on` off, nothing
-- to warn about, and no way to "extend the series" because no series exists — only a chain of
-- tasks each spawned by the last. It also drifts: complete Sunday's chore on Wednesday and every
-- future occurrence shifts three days, so "every Sunday" stops being every Sunday. And deleting
-- the chain to stop it takes the completed history with it.
--
-- So: `task_series` holds the rule, a cron job materializes `tasks` rows from it, and completing
-- an occurrence touches only that occurrence. This mirrors how `workout_plans` already relates to
-- `strength_sessions` — the plan is the intent, the rows are the history.
--
-- WHY NOT AN RRULE COLUMN
--
-- Full RFC 5545 is far more than these cases need and drags in a parser on both the Python and
-- TypeScript sides. Three freqs plus an interval covers everything in the backlog. `BYSETPOS`
-- ("last Friday of the month") is the first thing that would force a revisit; nothing asks for it
-- today.

create table if not exists task_series (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  list_id      uuid references task_lists(id) on delete set null,
  title        text not null,
  priority     text check (priority in ('high', 'medium', 'low')),
  freq         text not null check (freq in ('daily', 'weekly', 'monthly')),
  interval     integer not null default 1 check (interval >= 1),
  -- Weekly only: which days the series lands on. 0=Sun … 6=Sat, matching Postgres `extract(dow)`
  -- and JS `Date.getDay()` so neither side has to remap. Null/empty for daily and monthly.
  byweekday    integer[],
  starts_on    date not null,
  ends_on      date,                    -- null = open-ended; #689 never warns about these
  -- High-water mark for the spawner: the latest occurrence_date it has materialized. Lets the job
  -- resume without re-deriving the whole history, and makes "has this series ever run?" answerable.
  last_spawned date,
  -- Set when the user dismisses the #689 expiry warning ("Let it end"). An explicit dismissal is
  -- not forgetting, so it suppresses permanently rather than re-warning at 1 day.
  expiry_dismissed_at timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists task_series_user_id_idx on task_series (user_id);
-- The spawner's working set: open series whose window may still produce occurrences.
create index if not exists task_series_active_idx on task_series (user_id, ends_on);

alter table task_series enable row level security;
create policy "users access own data" on task_series
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- `on delete set null`, deliberately: deleting a series must leave completed occurrences in
-- history as ordinary tasks. `on delete cascade` here would erase the record of every chore ever
-- done, which is the opposite of what a history is for.
alter table tasks
  add column if not exists series_id uuid references task_series(id) on delete set null,
  -- The date this row represents in the series. Distinct from `due_date` (which the user may edit
  -- on a single occurrence) — this is the series calendar's own key, and it is what makes the
  -- spawn idempotent.
  add column if not exists occurrence_date date;

create index if not exists tasks_series_id_idx on tasks (series_id);

-- THE IDEMPOTENCE GUARANTEE. Re-running the spawn job — after a crash, twice in one day, or with
-- an overlapping window — cannot double-create an occurrence. The partial predicate keeps the
-- index off the many rows that are not series occurrences.
create unique index if not exists tasks_series_occurrence_uniq
  on tasks (series_id, occurrence_date) where series_id is not null;

-- Keep `updated_at` honest without every writer having to remember it — the shared
-- `set_updated_at()` from 20260426000000_db_generated_timestamps.sql, same as journal_entries et al.
drop trigger if exists trg_task_series_updated_at on task_series;
create trigger trg_task_series_updated_at
  before update on task_series
  for each row execute function set_updated_at();
