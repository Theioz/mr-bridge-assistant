-- ---------------------------------------------------------------------------
-- Cooking is a TRANSFER, not an event with a side effect.
--
-- `inventory_items` holds raw ingredients; `cooks` holds prepared leftovers. The schema
-- already calls them counterparts — "everything already in the kitchen the planner can
-- spend" — but nothing ever moved mass between them. Cooking a batch spent 1149 g of raw
-- chicken and produced 4 portions of leftovers, and the fridge kept reporting the chicken.
--
-- The failure is SILENT AND DIRECTIONAL: inventory over-reports. A row that should be zero
-- still shows stock, so the next fridge audit plans a meal around food that is already
-- eaten, and the expiry flags fire on ghosts. Seen at least twice (broccolini 2026-08-08,
-- red bell pepper 2026-08-12), both found only because something else prompted a look.
--
-- This migration adds the two things a transfer needs that were missing:
--
--   1. `inventory_items.fdc_id` — so a recipe line can be matched to a stock row EXACTLY
--      rather than by guessing at its name.
--   2. `inventory_draws` — a ledger of what each cook actually took, so the transfer can be
--      undone when the cook is deleted, and so "why is this row at zero?" has an answer.
--
-- WHY A LEDGER RATHER THAN JUST SUBTRACTING. A draw is not recomputable after the fact:
-- quantities get clamped at zero, recipes get edited, and inventory rows get renamed. The
-- amount that must come back is the amount that actually left, which is only knowable if it
-- was written down at the time. This is the same lesson as the retired plan-time decrement
-- convention (Jason, 2026-08-16): the 2026-08-14 roast-chicken batch was never cooked, its
-- plan-time decrement had no reversal path, and 227 g of baby bella plus 255 g of spinach
-- sat in the fridge for three days while their rows read empty.
-- ---------------------------------------------------------------------------

-- ── 1. Exact matching ───────────────────────────────────────────────────────
-- Recipe ingredient lines already carry a pinned `fdc_id` (the USDA record the macros were
-- computed from). Carrying the same id on the stock row turns "is this the gochujang?" from
-- a string heuristic into an equality test. Nullable: a hand-added row without one still
-- matches by normalized name, it just matches less certainly.
alter table public.inventory_items
  add column if not exists fdc_id integer;

comment on column public.inventory_items.fdc_id is
  'USDA FoodData Central id, matching the fdc_id pinned on recipe ingredient lines. Null is '
  'fine — the draw then falls back to normalized-name matching. Set it to make the match exact.';

create index if not exists inventory_items_user_fdc_idx
  on public.inventory_items (user_id, fdc_id)
  where fdc_id is not null;

-- ── 2. The ledger ───────────────────────────────────────────────────────────
create table if not exists public.inventory_draws (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users (id) on delete cascade,

  inventory_item_id uuid not null references public.inventory_items (id) on delete cascade,
  -- What caused the draw. Today that is always a cook; the column is nullable so a future
  -- direct-meal draw can point at a meal_log instead without a schema change.
  cook_id           uuid references public.cooks (id) on delete cascade,

  -- The delta ACTUALLY APPLIED to the row, in the row's own unit at the time of the draw —
  -- NOT what the recipe asked for. A recipe wanting 60 g against a row holding 40 g draws
  -- 40, and 40 is what must come back. Storing the request instead would over-restore.
  quantity_applied  numeric(10, 2) not null check (quantity_applied > 0),
  unit              text,

  -- What the recipe asked for, in grams, for reporting and for spotting chronic shortfalls.
  -- `grams_requested - grams_applied > 0` means the kitchen did not have enough.
  grams_requested   numeric(10, 2),
  grams_applied     numeric(10, 2),

  -- Which ingredient line produced this, kept for display and for auditing a bad match.
  ingredient_label  text,
  -- 'fdc_id' (exact) or 'name' (normalized fallback) — so a wrong draw can be traced to the
  -- matching strategy that produced it rather than guessed at.
  match_method      text check (match_method in ('fdc_id', 'name')),

  -- Set when the draw has been given back. Reversal is idempotent: the trigger below only
  -- restores rows where this is null, so deleting an already-restored cook cannot double-add.
  reversed_at       timestamptz,

  created_at        timestamptz not null default now()
);

create index if not exists inventory_draws_user_idx on public.inventory_draws (user_id);
create index if not exists inventory_draws_cook_idx on public.inventory_draws (cook_id)
  where cook_id is not null;
create index if not exists inventory_draws_item_idx on public.inventory_draws (inventory_item_id);

comment on table public.inventory_draws is
  'What each cook actually took out of inventory_items. The record that makes a draw '
  'reversible and makes "why is this row at zero?" answerable: eaten, versus discarded.';
comment on column public.inventory_draws.quantity_applied is
  'The delta actually applied to the row, in the row''s own unit — not the amount requested. '
  'A 60 g request against a 40 g row draws 40, and 40 is what a reversal must give back.';

alter table public.inventory_draws enable row level security;

drop policy if exists inventory_draws_owner_all on public.inventory_draws;
create policy inventory_draws_owner_all on public.inventory_draws
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

grant select, insert, update, delete on public.inventory_draws to anon, authenticated, service_role;

-- ── 3. Deleting a cook gives the raw ingredients back ───────────────────────
-- In the DATABASE rather than in the delete handler, for the reason 20260813120000 and
-- 20260825120000 already record: a rule enforced only on the app's own path is not enforced.
-- Cooks get deleted through PostgREST with the service key too — that is how the duplicate
-- Lamb Pasta rows were removed on 2026-08-16 — and such a delete must not strand the draw.
--
-- BEFORE DELETE, so it runs while the ledger rows still exist: `inventory_draws.cook_id` is
-- ON DELETE CASCADE, and an AFTER trigger would find them already gone.
create or replace function public.cooks_restore_inventory()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  d record;
begin
  for d in
    select id, inventory_item_id, quantity_applied
    from public.inventory_draws
    where cook_id = old.id and reversed_at is null
  loop
    -- `quantity is not null` guards the staples. A staple (null = "on hand, amount
    -- untracked") is never drawn from in the first place, and adding a number to one would
    -- silently convert it into a tracked row holding whatever this cook happened to want.
    update public.inventory_items
       set quantity   = quantity + d.quantity_applied,
           updated_at = now()
     where id = d.inventory_item_id
       and quantity is not null;

    update public.inventory_draws
       set reversed_at = now()
     where id = d.id;
  end loop;

  return old;
end;
$$;

drop trigger if exists cooks_restore_inventory on public.cooks;

create trigger cooks_restore_inventory
  before delete on public.cooks
  for each row
  execute function public.cooks_restore_inventory();

comment on function public.cooks_restore_inventory() is
  'Gives back what a cook drew from inventory_items when the cook is deleted, using the '
  'amounts recorded in inventory_draws rather than recomputing them from the recipe. '
  'Idempotent — only un-reversed draws are restored. Applies to every deleter including PostgREST.';
