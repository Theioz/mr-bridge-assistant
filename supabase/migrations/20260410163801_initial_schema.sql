-- Mr. Bridge — Initial Schema Migration
-- Strategy: every table has a `metadata JSONB` column for extension without schema changes.
-- New integrations add fields to metadata first; promote to real columns via additive migrations only.
-- NEVER drop columns — use additive ALTER TABLE ADD COLUMN for all future changes.

-- ============================================================
-- HABIT TRACKING  (from memory/habits.md)
-- ============================================================

create table if not exists habit_registry (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  emoji       text,
  category    text,
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  metadata    jsonb not null default '{}'
);

create table if not exists habits (
  id          uuid primary key default gen_random_uuid(),
  habit_id    uuid not null references habit_registry(id) on delete cascade,
  date        date not null,
  completed   boolean not null default false,
  notes       text,
  metadata    jsonb not null default '{}',
  unique (habit_id, date)
);

create index on habits (date);

-- ============================================================
-- TASKS & STUDY LOG  (from memory/todo.md)
-- ============================================================

create table if not exists tasks (
  id           uuid primary key default gen_random_uuid(),
  title        text not null,
  priority     text check (priority in ('high', 'medium', 'low')),
  status       text not null default 'active' check (status in ('active', 'completed', 'archived')),
  due_date     date,
  category     text,
  completed_at timestamptz,
  created_at   timestamptz not null default now(),
  metadata     jsonb not null default '{}'
);

create index on tasks (status);
create index on tasks (due_date);

create table if not exists study_log (
  id            uuid primary key default gen_random_uuid(),
  date          date not null,
  subject       text not null,
  duration_mins int,
  notes         text,
  metadata      jsonb not null default '{}'
);

create index on study_log (date);

-- ============================================================
-- FITNESS  (from memory/fitness_log.md)
-- ============================================================

-- Body composition entries (Google Fit weight + Renpho body comp)
create table if not exists fitness_log (
  id             uuid primary key default gen_random_uuid(),
  date           date not null,
  weight_lb      numeric(5,1),
  body_fat_pct   numeric(4,1),
  bmi            numeric(4,1),
  muscle_mass_lb numeric(5,1),
  visceral_fat   numeric(4,1),
  source         text,   -- 'renpho', 'google_fit'
  metadata       jsonb not null default '{}'
);

create index on fitness_log (date);

-- Workout sessions (Fitbit + manual)
create table if not exists workout_sessions (
  id            uuid primary key default gen_random_uuid(),
  date          date not null,
  start_time    time,
  activity      text not null,
  duration_mins int,
  calories      int,
  avg_hr        int,
  notes         text,
  source        text,   -- 'fitbit', 'manual'
  metadata      jsonb not null default '{}'
  -- future Fitbit fields: metadata: {"hr_zones": {...}, "active_minutes": 42}
);

create index on workout_sessions (date);

-- Recovery metrics (Oura)
create table if not exists recovery_metrics (
  id              uuid primary key default gen_random_uuid(),
  date            date not null unique,
  bedtime         time,
  total_sleep_hrs numeric(4,2),
  deep_hrs        numeric(4,2),
  rem_hrs         numeric(4,2),
  avg_hrv         int,
  resting_hr      int,
  readiness       int,
  sleep_score     int,
  active_cal      int,
  source          text default 'oura',
  metadata        jsonb not null default '{}'
  -- future Oura metrics: metadata: {"spo2_avg": 97, "body_temp_delta": 0.1}
);

create index on recovery_metrics (date);

-- ============================================================
-- MEALS & RECIPES  (from memory/meal_log.md)
-- ============================================================

create table if not exists recipes (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  cuisine      text,
  ingredients  text,
  instructions text,
  tags         text[],
  created_at   timestamptz not null default now(),
  metadata     jsonb not null default '{}'
);

create table if not exists meal_log (
  id          uuid primary key default gen_random_uuid(),
  date        date not null,
  meal_type   text check (meal_type in ('breakfast', 'lunch', 'dinner', 'snack')),
  recipe_id   uuid references recipes(id) on delete set null,
  notes       text,
  metadata    jsonb not null default '{}'
);

create index on meal_log (date);

-- ============================================================
-- PROFILE  (from memory/profile.md)
-- Key-value by design — already flexible for any new fields
-- ============================================================

create table if not exists profile (
  id         uuid primary key default gen_random_uuid(),
  key        text not null unique,
  value      text,
  updated_at timestamptz not null default now()
);

-- ============================================================
-- INTEGRATION SYNC LOG
-- Tracks every external sync from any source.
-- Adding a new integration (Whoop, Apple Health, etc.) = zero schema changes.
-- ============================================================

create table if not exists sync_log (
  id              uuid primary key default gen_random_uuid(),
  source          text not null,   -- 'oura', 'fitbit', 'google_fit', 'renpho', etc.
  synced_at       timestamptz not null default now(),
  status          text not null check (status in ('ok', 'error', 'partial')),
  records_written int default 0,
  error_message   text
);

create index on sync_log (source, synced_at desc);

-- ============================================================
-- CHAT SESSION CONTINUITY (cross-device session sync)
-- Used by the future web interface (#10) and voice interface.
-- ============================================================

create table if not exists chat_sessions (
  id             uuid primary key default gen_random_uuid(),
  device         text,   -- 'web', 'voice', 'cli', etc.
  started_at     timestamptz not null default now(),
  last_active_at timestamptz not null default now(),
  summary        text,
  metadata       jsonb not null default '{}'
);

create table if not exists chat_messages (
  id         uuid primary key default gen_random_uuid(),
  session_id uuid not null references chat_sessions(id) on delete cascade,
  role       text not null check (role in ('user', 'assistant', 'system')),
  content    text not null,
  created_at timestamptz not null default now(),
  metadata   jsonb not null default '{}'
);

create index on chat_messages (session_id, created_at);

-- ============================================================
-- TIMER STATE  (from memory/timer_state.json)
-- Single-row table — upsert to update
-- ============================================================

create table if not exists timer_state (
  id         uuid primary key default gen_random_uuid(),
  active     boolean not null default false,
  subject    text,
  category   text,
  start_time timestamptz,
  updated_at timestamptz not null default now()
);

-- ============================================================
-- ROW LEVEL SECURITY
-- Single-user setup: authenticated role gets full access.
-- Service-role key (Python scripts + CLI agents) bypasses RLS by design.
-- Anon key (future web app via Supabase Auth) uses the policy below.
-- ============================================================

alter table habit_registry     enable row level security;
alter table habits              enable row level security;
alter table tasks               enable row level security;
alter table study_log           enable row level security;
alter table fitness_log         enable row level security;
alter table workout_sessions    enable row level security;
alter table recovery_metrics    enable row level security;
alter table recipes             enable row level security;
alter table meal_log            enable row level security;
alter table profile             enable row level security;
alter table sync_log            enable row level security;
alter table chat_sessions       enable row level security;
alter table chat_messages       enable row level security;
alter table timer_state         enable row level security;

create policy "authenticated full access" on habit_registry     for all to authenticated using (true) with check (true);
create policy "authenticated full access" on habits              for all to authenticated using (true) with check (true);
create policy "authenticated full access" on tasks               for all to authenticated using (true) with check (true);
create policy "authenticated full access" on study_log           for all to authenticated using (true) with check (true);
create policy "authenticated full access" on fitness_log         for all to authenticated using (true) with check (true);
create policy "authenticated full access" on workout_sessions    for all to authenticated using (true) with check (true);
create policy "authenticated full access" on recovery_metrics    for all to authenticated using (true) with check (true);
create policy "authenticated full access" on recipes             for all to authenticated using (true) with check (true);
create policy "authenticated full access" on meal_log            for all to authenticated using (true) with check (true);
create policy "authenticated full access" on profile             for all to authenticated using (true) with check (true);
create policy "authenticated full access" on sync_log            for all to authenticated using (true) with check (true);
create policy "authenticated full access" on chat_sessions       for all to authenticated using (true) with check (true);
create policy "authenticated full access" on chat_messages       for all to authenticated using (true) with check (true);
create policy "authenticated full access" on timer_state         for all to authenticated using (true) with check (true);
