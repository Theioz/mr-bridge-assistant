-- Recipes become structured data: an ingredient is a row, a step is a step.
--
-- WHY THIS IS NOT A FORMATTING CHANGE
--
-- `recipes.ingredients` is free text, and it is the INPUT TO THE MACRO PIPELINE. Today
-- resolveRecipeMacros() hands that prose to a local 7B model (parseFoodText) to be split into
-- {query, qty, unit} before USDA ever sees it. web/src/lib/nutrition/parse.ts documents why that
-- is a liability in its own words: the model called a large egg 105 g (real ~50 g) and a cup of
-- cooked rice 284 g (real ~158 g) — both ~2x heavy. The codebase already works around this by
-- re-lexing every quantity out of the source fragment in quantity.ts, "because the model
-- demonstrably alters numbers it is asked to repeat".
--
-- All of that machinery exists to recover structure that was thrown away at write time. When the
-- quantity is a number in a column, there is nothing to parse, nothing to re-lex, and nothing to
-- mangle. The model step is skipped outright for a structured recipe.
--
-- fdc_id closes the other half. USDA's top hit for "chicken breast, cooked" is "Chicken breast
-- tenders, breaded, cooked, microwaved" — 252 kcal and 17.6 g carbs against ~165/0 for the plain
-- cut. Pinning the FDC id per ingredient makes re-resolution deterministic: the same recipe
-- resolves to the same numbers next month, which is the whole point of tracking a trend.
--
-- ADDITIVE, NOT A CUTOVER
--
-- ~65 recipes hold prose or newline text today, four of them on the current week's plan. The text
-- columns stay and remain the fallback: readers prefer `ingredients_json` when present and drop
-- back to `ingredients` otherwise, so a half-finished backfill renders correctly throughout.
-- parseIngredients() (added in #665, after a batch script JSON-encoded an array into the text
-- column and the page printed the JSON at Jason) keeps covering the legacy path.
--
-- Shape mirrors workout_plans.warmup/workout/cooldown, which have stored arrays of typed objects
-- since the initial schema. Meals were the odd one out; now they are not.

alter table recipes
  -- Array of ingredient objects. See RecipeIngredient in web/src/lib/types.ts.
  --   { item, quantity, unit, prep?, group?, optional?, note?, fdc_id? }
  -- `quantity`/`unit` null is legitimate — "salt, to taste" is a real ingredient with no amount.
  -- Such a row renders fine and is simply skipped by the macro resolver, exactly as an
  -- unquantified line is today.
  add column if not exists ingredients_json jsonb
    constraint recipes_ingredients_json_is_array
    check (ingredients_json is null or jsonb_typeof(ingredients_json) = 'array'),

  -- Array of step objects. See RecipeStep in web/src/lib/types.ts.
  --   { step, text, tips?, duration_mins? }
  add column if not exists steps_json jsonb
    constraint recipes_steps_json_is_array
    check (steps_json is null or jsonb_typeof(steps_json) = 'array');

comment on column recipes.ingredients_json is
  'Structured ingredients: [{item, quantity, unit, prep, group, optional, note, fdc_id}]. '
  'Preferred over the legacy `ingredients` text column when present; readers fall back to it. '
  'When a row carries quantity+unit the macro resolver skips the local model entirely and goes '
  'straight to USDA; when it also carries fdc_id, USDA search and model selection are both '
  'skipped. Null quantity is valid (e.g. "salt, to taste") and is ignored for macros.';

comment on column recipes.steps_json is
  'Structured method: [{step, text, tips, duration_mins}]. Preferred over the legacy '
  '`instructions` text column when present. Display only — nothing in the macro path reads it.';

comment on column recipes.ingredients is
  'LEGACY free text, one ingredient per line. Retained as the fallback while ingredients_json is '
  'backfilled. Do not write new recipes here — write ingredients_json. Still parsed for display '
  'by parseIngredients(), which also recovers a JSON-array payload written into this column.';

comment on column recipes.instructions is
  'LEGACY free text. Retained as the fallback while steps_json is backfilled. Do not write new '
  'recipes here — write steps_json.';
