create table if not exists stocks_cache (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id),
  ticker      text not null,
  price       numeric,
  change_abs  numeric,
  change_pct  numeric,
  sparkline   jsonb,
  fetched_at  timestamptz not null default now(),
  unique (user_id, ticker)
);
create index on stocks_cache (user_id, ticker);
alter table stocks_cache enable row level security;
create policy "users manage own stocks cache"
  on stocks_cache for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
