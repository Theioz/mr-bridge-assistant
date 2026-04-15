create table if not exists sports_cache (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id),
  team_id     text not null,
  league      text not null,
  data        jsonb not null,
  fetched_at  timestamptz not null default now(),
  unique (user_id, team_id)
);
create index on sports_cache (user_id, team_id);
alter table sports_cache enable row level security;
create policy "users manage own sports cache"
  on sports_cache for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
