-- Meal coordination, part 1: give food measured macros, and model how it is actually made.
--
-- Recipes carry no nutrition today, so nothing can be planned against a macro target, and
-- meal_log.recipe_id — present since the initial schema — has never once been populated
-- (0 of 44 rows). Every meal was therefore a from-scratch photo -> USDA round trip. That
-- friction is the most likely reason meal logging stopped on 2026-05-05.
--
-- THE MODEL
--
--   recipes    the library — "I cooked this, it was good, I'd cook it again".
--              Macros are for the recipe AS WRITTEN (the whole tray).
--   cooks      ONE TIME you made something. Carries the portion count.
--   meal_log   "I ate a portion of that cook" — macros = cook total / portions.
--
-- Portions live on the COOK, not the recipe. You do not cook "the 6-serving chicken bowl";
-- you cook a pile of chicken and then eyeball it into however many containers you feel like
-- that day. The same recipe splits 5 ways one week and 7 the next. Putting servings on the
-- recipe would assert a property the dish does not have.
--
-- This makes a one-off meal NOT a special case: it is a cook with portions = 1, eaten the
-- same day. Batch prep is a cook with 6 portions that drains over the week. Cooking down
-- leftover ingredients is a cook with no recipe behind it. One object, three behaviours.
--
-- ON ACCURACY: the eyeball is the error bar. If a tray is split six ways and one container
-- is 20% bigger, no amount of USDA precision rescues the number. These figures are for
-- direction and consistency across weeks, not lab-grade accuracy — which is all a
-- body-composition trend actually needs. Do not build anything that implies otherwise.

-- ---------------------------------------------------------------------------
-- recipes: macros for the recipe as written, resolved ONCE through the existing
-- USDA/FDC pipeline (web/src/lib/nutrition/estimate.ts). The local model identifies the
-- foods; USDA supplies every gram. No macro value here is ever model-authored.
-- ---------------------------------------------------------------------------

alter table recipes
  add column if not exists calories  int,
  add column if not exists protein_g numeric(7, 1),
  add column if not exists carbs_g   numeric(7, 1),
  add column if not exists fat_g     numeric(7, 1),
  add column if not exists fiber_g   numeric(7, 1),

  -- A HINT for planning ("last time you split this 6 ways"), overridable at cook time.
  -- Explicitly not a truth about the dish. Null = never cooked / no idea yet.
  add column if not exists typical_portions int
    constraint recipes_typical_portions_positive check (typical_portions is null or typical_portions > 0),

  -- 'low' means the ingredient text was vague enough that USDA had to guess at a portion.
  -- Surface it rather than let a soft number look authoritative.
  add column if not exists macros_confidence text
    constraint recipes_macros_confidence_valid
    check (macros_confidence is null or macros_confidence in ('high', 'medium', 'low')),
  add column if not exists macros_computed_at timestamptz;

comment on column recipes.calories is
  'Macros for the WHOLE recipe as written, not a serving. USDA-derived; never model-authored.';
comment on column recipes.typical_portions is
  'Planning hint only ("usually splits ~6 ways"). The real count lives on each cook.';
comment on column recipes.macros_computed_at is
  'Null = never resolved. Staleness vs edited ingredients is expected; re-resolve on demand.';

-- ---------------------------------------------------------------------------
-- cooks: one time you actually made food.
-- ---------------------------------------------------------------------------

create table if not exists cooks (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,

  -- Null for an ad-hoc cook — leftover ingredients thrown together, never a saved recipe.
  -- Such a cook resolves its own macros through the same USDA pipeline.
  recipe_id   uuid references recipes (id) on delete set null,
  name        text not null,

  cooked_on   date not null,

  -- Eyeballed. See the accuracy note above.
  portions    int  not null default 1
              constraint cooks_portions_positive check (portions > 0),

  -- Decremented as portions are eaten. This IS the leftovers view: what is in the fridge
  -- right now is simply the cooks with portions_remaining > 0. The Sunday plan should eat
  -- those down before it proposes buying more food.
  portions_remaining int not null
              constraint cooks_remaining_sane check (portions_remaining >= 0),

  -- Macros for the WHOLE cook. Copied from the recipe at cook time rather than joined, so
  -- that later edits to the recipe cannot silently rewrite the nutrition of food you have
  -- already eaten.
  calories    int,
  protein_g   numeric(7, 1),
  carbs_g     numeric(7, 1),
  fat_g       numeric(7, 1),
  fiber_g     numeric(7, 1),

  notes       text,
  metadata    jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),

  constraint cooks_remaining_lte_portions check (portions_remaining <= portions)
);

create index if not exists cooks_user_cooked_on_idx on cooks (user_id, cooked_on desc);
-- The leftovers query: "what can I eat right now without cooking?"
create index if not exists cooks_user_remaining_idx on cooks (user_id, portions_remaining)
  where portions_remaining > 0;

comment on table cooks is
  'One time the user made food. Batch prep = many portions draining over days; a one-off '
  'meal = portions 1; leftover-ingredient cooking = recipe_id null. Same object throughout.';
comment on column cooks.calories is
  'Macros for the WHOLE cook, snapshotted at cook time. Deliberately copied, not joined: '
  'editing a recipe must not retroactively change what you already ate.';

alter table cooks enable row level security;

drop policy if exists cooks_owner_all on cooks;
create policy cooks_owner_all on cooks
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- meal_log: link a logged meal to the cook it came from.
-- ---------------------------------------------------------------------------

alter table meal_log
  add column if not exists cook_id uuid references cooks (id) on delete set null,
  add column if not exists portions numeric(4, 2) not null default 1
    constraint meal_log_portions_positive check (portions > 0);

create index if not exists meal_log_cook_id_idx on meal_log (cook_id) where cook_id is not null;

comment on column meal_log.cook_id is
  'Set when the meal came from something cooked. Macros are then cook totals x portions '
  'eaten — a confirm, not a fresh USDA lookup. Null for ad-hoc meals logged by photo.';
comment on column meal_log.portions is
  'Portions of the cook eaten. Usually 1; 0.5 for half a container, 2 for a big day.';
