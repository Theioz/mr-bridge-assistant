-- Mr. Bridge — Multi-tenancy Migration
-- Adds user_id to all 14 data tables, backfills real owner, updates RLS.
-- sync_log stays global (no user scope needed).
--
-- Strategy:
--   1. Add user_id as nullable
--   2. Backfill all existing rows with the real owner's auth UID
--      (first non-demo user in auth.users, or the single existing user)
--   3. Set NOT NULL
--   4. Drop old "authenticated full access" policies
--   5. Create new per-user RLS policies

-- ============================================================
-- STEP 1 — Add nullable user_id to all 14 tables
-- ============================================================

alter table habit_registry    add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table habits             add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table tasks              add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table study_log          add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table fitness_log        add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table workout_sessions   add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table recovery_metrics   add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table recipes            add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table meal_log           add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table profile            add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table chat_sessions      add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table chat_messages      add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table timer_state        add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table journal_entries    add column if not exists user_id uuid references auth.users(id) on delete cascade;

-- ============================================================
-- STEP 2 — Backfill existing rows with the real owner's UID
-- ============================================================

do $$
declare
  owner_uid uuid;
begin
  -- Find the real owner: first user in auth.users who is not the demo account.
  -- If demo@mr-bridge.app doesn't exist yet, this just returns the first user.
  select id into owner_uid
  from auth.users
  where email != 'demo@mr-bridge.app'
  order by created_at asc
  limit 1;

  if owner_uid is null then
    raise notice 'No owner found in auth.users — skipping backfill. Run migration again after creating the real account.';
    return;
  end if;

  raise notice 'Backfilling all tables with owner_uid = %', owner_uid;

  update habit_registry    set user_id = owner_uid where user_id is null;
  update habits             set user_id = owner_uid where user_id is null;
  update tasks              set user_id = owner_uid where user_id is null;
  update study_log          set user_id = owner_uid where user_id is null;
  update fitness_log        set user_id = owner_uid where user_id is null;
  update workout_sessions   set user_id = owner_uid where user_id is null;
  update recovery_metrics   set user_id = owner_uid where user_id is null;
  update recipes            set user_id = owner_uid where user_id is null;
  update meal_log           set user_id = owner_uid where user_id is null;
  update profile            set user_id = owner_uid where user_id is null;
  update chat_sessions      set user_id = owner_uid where user_id is null;
  update chat_messages      set user_id = owner_uid where user_id is null;
  update timer_state        set user_id = owner_uid where user_id is null;
  update journal_entries    set user_id = owner_uid where user_id is null;
end $$;

-- ============================================================
-- STEP 3 — Enforce NOT NULL now that rows are backfilled
-- ============================================================

alter table habit_registry    alter column user_id set not null;
alter table habits             alter column user_id set not null;
alter table tasks              alter column user_id set not null;
alter table study_log          alter column user_id set not null;
alter table fitness_log        alter column user_id set not null;
alter table workout_sessions   alter column user_id set not null;
alter table recovery_metrics   alter column user_id set not null;
alter table recipes            alter column user_id set not null;
alter table meal_log           alter column user_id set not null;
alter table profile            alter column user_id set not null;
alter table chat_sessions      alter column user_id set not null;
alter table chat_messages      alter column user_id set not null;
alter table timer_state        alter column user_id set not null;
alter table journal_entries    alter column user_id set not null;

-- Add indexes for fast per-user queries
create index if not exists habit_registry_user_id_idx    on habit_registry    (user_id);
create index if not exists habits_user_id_idx             on habits             (user_id);
create index if not exists tasks_user_id_idx              on tasks              (user_id);
create index if not exists study_log_user_id_idx          on study_log          (user_id);
create index if not exists fitness_log_user_id_idx        on fitness_log        (user_id);
create index if not exists workout_sessions_user_id_idx   on workout_sessions   (user_id);
create index if not exists recovery_metrics_user_id_idx   on recovery_metrics   (user_id);
create index if not exists recipes_user_id_idx            on recipes            (user_id);
create index if not exists meal_log_user_id_idx           on meal_log           (user_id);
create index if not exists profile_user_id_idx            on profile            (user_id);
create index if not exists chat_sessions_user_id_idx      on chat_sessions      (user_id);
create index if not exists chat_messages_user_id_idx      on chat_messages      (user_id);
create index if not exists timer_state_user_id_idx        on timer_state        (user_id);
create index if not exists journal_entries_user_id_idx    on journal_entries    (user_id);

-- ============================================================
-- STEP 4 — Drop the old "authenticated full access" policies
-- ============================================================

drop policy if exists "authenticated full access" on habit_registry;
drop policy if exists "authenticated full access" on habits;
drop policy if exists "authenticated full access" on tasks;
drop policy if exists "authenticated full access" on study_log;
drop policy if exists "authenticated full access" on fitness_log;
drop policy if exists "authenticated full access" on workout_sessions;
drop policy if exists "authenticated full access" on recovery_metrics;
drop policy if exists "authenticated full access" on recipes;
drop policy if exists "authenticated full access" on meal_log;
drop policy if exists "authenticated full access" on profile;
drop policy if exists "authenticated full access" on sync_log;
drop policy if exists "authenticated full access" on chat_sessions;
drop policy if exists "authenticated full access" on chat_messages;
drop policy if exists "authenticated full access" on timer_state;
drop policy if exists "authenticated full access" on journal_entries;

-- ============================================================
-- STEP 5 — New per-user RLS policies (own data only)
-- ============================================================

create policy "users access own data" on habit_registry
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "users access own data" on habits
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "users access own data" on tasks
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "users access own data" on study_log
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "users access own data" on fitness_log
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "users access own data" on workout_sessions
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "users access own data" on recovery_metrics
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "users access own data" on recipes
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "users access own data" on meal_log
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "users access own data" on profile
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- sync_log: any authenticated user can read/write (global integration log)
create policy "authenticated full access" on sync_log
  for all to authenticated
  using (true)
  with check (true);

create policy "users access own data" on chat_sessions
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "users access own data" on chat_messages
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "users access own data" on timer_state
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "users access own data" on journal_entries
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
