-- ---------------------------------------------------------------------------
-- inventory_items: raw ingredients on hand — the fridge/freezer/pantry.
--
-- `cooks` already tracks PREPARED leftovers (portions_remaining). This table is its
-- raw-ingredient counterpart: the salmon, rice and frozen steak you bought but have not
-- cooked yet. Together they answer the question the weekly planner should ask FIRST —
-- "what do I already have?" — so it plans INTO the kitchen instead of around it, oldest
-- and soonest-to-expire first, and remembers the frozen steak without being told each time.
-- ---------------------------------------------------------------------------

create table if not exists inventory_items (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,

  name        text not null,

  -- Deliberately loose: "2 steaks", "340 g", "1 bag". A weight (g/oz/lb) or a count
  -- (each/portion/can/bunch) — whatever matches how the item is actually stored. Null
  -- quantity means "on hand, amount untracked" (a pantry staple like rice or oil).
  quantity    numeric(10, 2),
  unit        text,

  -- Where it lives drives perishability AND how the planner treats it: fresh fish in the
  -- fridge must be cooked within days; the same fish in the freezer is next-week inventory.
  location    text not null default 'fridge'
              constraint inventory_items_location_check
              check (location in ('fridge', 'freezer', 'pantry', 'counter')),

  category    text,

  added_date  date not null default current_date,
  -- Estimated fresh-window end. Powers the "use soon" flag; null for shelf-stable items.
  expires_on  date,

  notes       text,
  metadata    jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists inventory_items_user_idx on inventory_items (user_id);
create index if not exists inventory_items_user_location_idx on inventory_items (user_id, location);
-- The "what's about to turn?" query — perishables sorted by fresh window.
create index if not exists inventory_items_user_expires_idx on inventory_items (user_id, expires_on)
  where expires_on is not null;

comment on table inventory_items is
  'Raw ingredients on hand (fridge/freezer/pantry). The counterpart to cooks (prepared '
  'leftovers): together they are everything already in the kitchen the planner can spend.';
comment on column inventory_items.quantity is
  'Null = on hand but amount untracked (a staple). Otherwise a count or a weight, paired '
  'with unit. Loose by design — this is a shopping/perishability aid, not lab inventory.';
comment on column inventory_items.location is
  'Drives perishability: the same protein is "cook this week" in the fridge and "next week" '
  'in the freezer. Moving fridge->freezer is how "I froze it" is recorded.';

alter table inventory_items enable row level security;

drop policy if exists inventory_items_owner_all on inventory_items;
create policy inventory_items_owner_all on inventory_items
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
