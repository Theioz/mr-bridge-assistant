-- Admin audit log (#462)
-- Every mutation made via the admin panel writes one row here.
-- Only accessible via the service-role client; no RLS SELECT policy for regular users.

create table admin_audit_log (
  id             uuid primary key default gen_random_uuid(),
  admin_user_id  uuid not null references auth.users(id),
  target_user_id uuid references auth.users(id),  -- null for global flag changes
  action         text not null,
  before_value   jsonb,
  after_value    jsonb,
  created_at     timestamptz not null default now()
);

alter table admin_audit_log enable row level security;
-- No SELECT policy for authenticated users — service role bypasses RLS.
