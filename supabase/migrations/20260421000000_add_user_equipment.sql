create table user_equipment (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  equipment_type text not null,
  weight_lbs numeric,
  resistance_level text,
  count integer not null default 1,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- dedupe by (user, type, weight, resistance) — NULLs treated as equal so
-- e.g. two "slider" rows (both weight_lbs=NULL) collapse to one
alter table user_equipment
  add constraint user_equipment_unique
  unique nulls not distinct (user_id, equipment_type, weight_lbs, resistance_level);

create index user_equipment_user_type_idx on user_equipment (user_id, equipment_type);

alter table user_equipment enable row level security;

create policy "users manage own equipment"
  on user_equipment
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
