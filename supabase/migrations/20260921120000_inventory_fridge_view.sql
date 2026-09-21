-- Fridge view support. Applied live by hand on 2026-09-21; this file exists for repo parity
-- (deploy does NOT run migrations). All four are additive and nullable.
alter table public.inventory_items
  add column if not exists packaged_food_id uuid references public.packaged_foods(id) on delete set null,
  add column if not exists image_key        text,
  add column if not exists macros_per_100g  jsonb,
  add column if not exists macros_source    text,
  add column if not exists macros_cached_at timestamptz;
