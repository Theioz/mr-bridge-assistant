create table packages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  tracking_number text not null,
  carrier text not null,
  aftership_slug text,
  aftership_id text,
  description text,
  retailer text,
  status text,
  estimated_delivery date,
  delivered_at timestamptz,
  gmail_message_id text,
  last_synced_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (user_id, tracking_number)
);

create index packages_user_eta_idx on packages (user_id, estimated_delivery);

alter table packages enable row level security;

create policy "users manage own packages"
  on packages for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
