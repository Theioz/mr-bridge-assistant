-- ---------------------------------------------------------------------------
-- Remember which USDA record a food name resolved to.
--
-- Choosing the USDA entry is a model call: search returns five candidates and the model picks
-- one, because USDA's top hit for "chicken breast, cooked" is *Chicken breast tenders, breaded,
-- cooked, microwaved* (252 kcal, 17.6 g carbs) rather than plain breast (~165 kcal, 0 g). That
-- call is cheap on its own (~190 tokens, ~1.2 s) and it runs once per food per meal, forever,
-- for the same fifteen foods this kitchen actually cooks.
--
-- TWO PROBLEMS, ONE TABLE.
--
--   1. Speed. A dozen foods is a dozen model calls before a single macro is known.
--
--   2. Drift, which matters more. Nothing pins the answer, so the SAME food can resolve to a
--      DIFFERENT USDA record on a different day — a different search ranking, a model that is
--      not confident this time, a timeout that falls back to the top hit. The macros then move
--      without the food moving, and a weekly average quietly compares two different chickens.
--      recipes.ingredients_json already solved this for recipes by pinning fdc_id; ad-hoc meals
--      had no equivalent.
--
-- Deliberately NOT user-scoped. "chicken breast, roasted" means the same thing in every
-- kitchen, and a per-user copy would just make the first meal of every account slow again.
--
-- Deliberately NOT reachable from a browser. RLS is on with NO policy, so anon/authenticated
-- get nothing; only the service-role client (lib/supabase/service.ts) reads or writes it. This
-- is a server-side memo, not user data.
-- ---------------------------------------------------------------------------

create table if not exists public.usda_food_picks (
  -- The normalized query, e.g. 'chicken breast, roasted'. Normalization lives in
  -- lib/nutrition/pick-cache.ts (lowercase, collapse whitespace, strip trailing punctuation)
  -- so that "Chicken Breast, Roasted " and "chicken breast, roasted" are one row, not two.
  query text primary key,

  fdc_id integer not null,

  -- The record's USDA description AS CHOSEN. Not used for lookup — it is here so that
  -- "why did my chicken become tenders?" is answerable without re-querying FoodData Central.
  description text not null,

  hits integer not null default 1,
  created_at timestamptz not null default now(),
  last_used_at timestamptz not null default now()
);

comment on table public.usda_food_picks is
  'Server-side memo of food name -> chosen USDA fdc_id. Skips both the FDC search and the '
  'model selection call on a repeat food, and pins the answer so the same food does not '
  'resolve to a different record on a different day. Not user data; service-role only.';

-- Cheap reporting: what has this thing actually learned, and what is stale.
create index if not exists usda_food_picks_last_used_idx
  on public.usda_food_picks (last_used_at desc);

alter table public.usda_food_picks enable row level security;

-- No policy on purpose: service_role bypasses RLS, everyone else gets nothing.
revoke all on public.usda_food_picks from anon, authenticated;
grant select, insert, update, delete on public.usda_food_picks to service_role;
