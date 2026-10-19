-- Program tracking: what the weekly scorecard needs that no column held.
--
-- 1. meal_log.standard_drinks — alcohol has been logged as `snack` rows since 2026-07-22, so its
--    calories already count toward intake. What was missing is the ETHANOL count: calories hide
--    it (a sweet RTD and a dry wine differ 2x in kcal per drink), and the moderation targets are
--    written in US standard drinks (14 g ethanol). Null = not an alcohol row.
-- 2. meal_log.origin — where the food came from. The scorecard counts delivery orders, which were
--    only ever recoverable from free-text notes. Null = unknown (every row before this migration).
-- 3. meal_plans.is_cheat — the weekly cheat meal is budgeted, not earned. Flagging the row lets the
--    planner place exactly one and lets the scorecard report it, instead of inferring it from a
--    high-calorie day.
-- 4. body_measurements — tape measurements (waist first). Not a fitness_log column: fitness_log is
--    one row per (date, source) written by the scale sync, and a manual row with a null weight
--    would read as "the latest weigh-in" to every surface that takes the newest row.

alter table public.meal_log
  add column if not exists standard_drinks numeric(5,2) check (standard_drinks is null or standard_drinks >= 0);

alter table public.meal_log
  add column if not exists origin text check (origin is null or origin in ('home', 'restaurant', 'delivery', 'travel'));

alter table public.meal_plans
  add column if not exists is_cheat boolean not null default false;

create table if not exists public.body_measurements (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  date        date not null,
  waist_in    numeric(4,1) check (waist_in is null or (waist_in > 15 and waist_in < 80)),
  notes       text,
  created_at  timestamptz not null default now(),
  constraint body_measurements_user_date_unique unique (user_id, date)
);

alter table public.body_measurements enable row level security;

drop policy if exists "users manage own body measurements" on public.body_measurements;
create policy "users manage own body measurements" on public.body_measurements
  for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

revoke all on public.body_measurements from anon, authenticated;
grant select, insert, update, delete on public.body_measurements to authenticated;
