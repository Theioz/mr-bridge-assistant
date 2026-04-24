-- Per-tenant feature flags (#462)
-- null user_id = global default.
-- A per-user row with the same flag_name overrides the global default for that tenant.

create table feature_flags (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid references auth.users(id) on delete cascade,  -- null = global default
  flag_name  text not null,
  enabled    boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique nulls not distinct (user_id, flag_name)
);

alter table feature_flags enable row level security;

-- Users can read their own overrides and the global defaults (for future runtime flag checks).
create policy "users read own and global feature flags"
  on feature_flags for select to authenticated
  using (user_id = auth.uid() or user_id is null);

-- All writes go through the admin service role only.
