create table if not exists workout_plans (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users(id),
  date              date not null,
  warmup            jsonb not null default '[]',
  workout           jsonb not null default '[]',
  cooldown          jsonb not null default '[]',
  notes             text,
  calendar_event_id text,
  created_at        timestamptz default now(),
  updated_at        timestamptz default now(),
  unique (user_id, date)
);
create index on workout_plans (user_id, date);
alter table workout_plans enable row level security;
create policy "users manage own workout plans"
  on workout_plans for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
