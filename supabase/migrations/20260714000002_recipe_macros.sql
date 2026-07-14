-- Recipes carry no nutrition today, so nothing can be planned against a macro target
-- and a logged meal can never say "I ate the thing I cooked" — every meal is a
-- from-scratch photo -> USDA round trip. That friction is why meal_log stopped in May.
--
-- This gives a recipe measured macros, resolved ONCE through the existing USDA/FDC
-- pipeline (web/src/lib/nutrition/estimate.ts). The model identifies the foods; USDA
-- supplies the grams. No macro value here is ever produced by an LLM.

alter table recipes
  -- How many portions the recipe as written yields. This is the number the meal-prep
  -- flow turns on: the ingredient list is a TRAY ("3 lb chicken breast, 2 cups rice"),
  -- but you eat a CONTAINER. Only the user knows how they portion it, so it is set by
  -- hand rather than guessed.
  add column if not exists servings int not null default 1
    constraint recipes_servings_positive check (servings > 0),

  -- Macros for the ENTIRE recipe as written, not per serving. Per-serving is derived
  -- (total / servings) so that re-portioning a batch never requires re-running USDA.
  add column if not exists calories  int,
  add column if not exists protein_g numeric(7, 1),
  add column if not exists carbs_g   numeric(7, 1),
  add column if not exists fat_g     numeric(7, 1),
  add column if not exists fiber_g   numeric(7, 1),

  -- Provenance. "low" means the ingredient text was vague enough that USDA matching had
  -- to guess at a portion — surface it rather than let a soft number look authoritative.
  add column if not exists macros_confidence text
    constraint recipes_macros_confidence_valid
    check (macros_confidence in ('high', 'medium', 'low')),
  add column if not exists macros_computed_at timestamptz;

comment on column recipes.servings is
  'Portions the recipe as written yields. Per-serving macros = <macro> / servings.';
comment on column recipes.calories is
  'Macros are for the WHOLE recipe, not one serving. USDA-derived; never model-authored.';
comment on column recipes.macros_computed_at is
  'Null = never resolved. Stale vs updated ingredients is expected; re-resolve on demand.';

-- meal_log.recipe_id already exists but has never been populated (0 of 44 rows). It is
-- the link that makes "I ate the planned meal" a one-tap confirm instead of a photo.
comment on column meal_log.recipe_id is
  'Set when a logged meal came from a recipe. Macros are then recipe totals x servings '
  'eaten, not a fresh USDA lookup. Null for ad-hoc meals logged via the photo analyzer.';
