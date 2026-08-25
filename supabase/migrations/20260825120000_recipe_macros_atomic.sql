-- Macros and `macros_computed_at` are ONE UNIT — enforced for every writer including PostgREST.
--
-- WHY: `macros_computed_at` is the only thing the UI reads to decide a recipe is real.
-- `KitchenPanel.tsx` gates on `canEatRecipe = !cook && !!recipe && !!recipe.macros_computed_at`,
-- and the column is stamped in exactly ONE place — the USDA resolver path in
-- `web/src/lib/nutrition/recipe-macros.ts`. A writer that fills `calories`/`protein_g`/etc.
-- directly never stamps it. The row then has perfect macros, renders "Macros not resolved yet",
-- hides "Ate this", and falls through to the status-only button: the plan flips to `eaten` and
-- NO `meal_log` row is written. The meal silently logs nothing.
--
-- This has now happened twice, both times from a direct PostgREST write:
--
--   * 2026-08-08 — 18 recipes in this state, including four planned for that same week. Found only
--     because Jason said "I ate my lunch and I logged it" and `meal_log` had zero rows for the day.
--   * 2026-08-25 — "Avocado Toast", written by the assistant that morning and planned for the
--     snack slot on 8/25 and 8/26. Caught before either was tapped. Jason asked for the rule.
--
-- Same reasoning as 20260813120000: the TypeScript guard covers the app's own editor, which is the
-- path that has never broken this. Every occurrence came through PostgREST with the service key.
-- A rule enforced only on the path that never broke it is not enforcement.
--
-- ALL-NULL IS STILL LEGAL. The "Eating out" placeholder (5c99f52c) deliberately carries no macros
-- so a meal out can still satisfy "every plan has a recipe" (20260721000001); the real macros are
-- logged after eating. This rejects PARTIAL macros, not their absence.
--
-- fiber_g IS included in the required set. All 82 recipes that carry macros already have it, the
-- daily target tracks fiber against a 30 g goal, and a null reads as 0 in the day total — an
-- understatement that looks like a real number.
--
-- Verified against the LIVE database before writing: 83 recipes, 82 with complete macros +
-- macros_computed_at, 1 all-null placeholder, 0 with fiber_g null. Nothing needs backfilling and
-- this migration cannot fail on existing rows.
--
-- The trigger's column list is WIDENED here. 20260813120000 fired on
-- (ingredients_json, calories, typical_portions, name), so clearing `macros_computed_at` on its own
-- would not have tripped anything. It now fires on every macro column and on macros_computed_at.

create or replace function public.recipes_check_invariants()
returns trigger
language plpgsql
as $$
declare
  ing        jsonb;
  item_text  text;
  unit_text  text;
  qty        numeric;
  qty_text   text;
  rendered   text;
begin
  if new.ingredients_json is not null and jsonb_typeof(new.ingredients_json) = 'array' then
    for ing in select * from jsonb_array_elements(new.ingredients_json)
    loop
      item_text := lower(coalesce(ing->>'item', ''));
      unit_text := ing->>'unit';
      begin
        qty := nullif(ing->>'quantity', '')::numeric;
      exception when others then
        qty := null;
      end;
      -- FM leaves a bare trailing '.' on whole numbers (150 -> "150."), which then fails the
  -- "<digits> g" match below and would reject every correctly-named rice line. Strip it.
  qty_text := trim(trailing '.' from trim(to_char(coalesce(qty, 0), 'FM9999999990.99')));
      rendered  := qty_text || ' ' || coalesce(unit_text, '') || ' ' || item_text;

      -- Spoon-measured foods given a bare gram quantity. Gochujang is handled separately below.
      if unit_text = 'g'
         and qty is not null and qty > 0
         and item_text !~ 'gochujang'
         and item_text ~ '(avocado|olive|sesame|cooking|vegetable) oil|tomato paste|soy sauce|shoyu|tamari|peanut butter|flaxseed'
      then
        raise exception
          'recipe "%": ingredient "%" is measured by spoon, not weighed — give a volume (tsp/tbsp) and keep the grams in the item label',
          new.name, ing->>'item';
      end if;

      -- GOCHUJANG. Grams stay the quantity (isPlausibleMatch rejects the branded record 2113732,
      -- so a volume has no portion table to resolve against) but the spoon must be in the label.
      if item_text ~ 'gochujang' and qty is not null then
        if unit_text is distinct from 'g' then
          raise exception
            'recipe "%": ingredient "%" — gochujang keeps GRAMS as the quantity (1 tbsp = 20 g, from the serving size on FDC 2113732) and carries the spoon in its label, e.g. quantity 20, unit g, item "gochujang (1 tbsp)"',
            new.name, ing->>'item';
        end if;
        if item_text !~ '[0-9]+(\.[0-9]+)?\s*(tsp|tbsp|teaspoons?|tablespoons?)' then
          raise exception
            'recipe "%": ingredient "%" has % g with no spoon in the label — write "gochujang (% tbsp)"',
            new.name, ing->>'item', qty, trim(to_char(qty / 20.0, 'FM990.99'));
        end if;
      end if;

      -- RICE must be NAMED so annotateRice can fire: "<n> g dry <grain> rice" or
      -- "<n> g cooked white|brown rice". Skip rice vinegar/paper/flour/noodles and any line that
      -- already carries its own go.
      if unit_text = 'g'
         and qty is not null and qty > 0
         and item_text ~ '\yrice\y'
         and item_text !~ '\yrice\s+(vinegar|powder|paper|wine|flour|noodles?|cakes?|krispies)\y'
         and rendered !~ '\ygo\y'
         and rendered !~ '[0-9]+(\.[0-9]+)?\s*g\s+dry\s+(\w+\s+)?rice\y'
         and rendered !~ '[0-9]+(\.[0-9]+)?\s*g\s+cooked\s+(white|brown)\s+rice\y'
      then
        raise exception
          'recipe "%": ingredient "%" renders as "%" and annotateRice cannot match it, so no go is shown. Name it "dry <grain> rice, ..." or "cooked white|brown rice, ..." — e.g. "dry brown rice, long-grain"',
          new.name, ing->>'item', rendered;
      end if;
    end loop;
  end if;

  if coalesce(new.calories, 0) > 1200 and coalesce(new.typical_portions, 1) <= 1 then
    raise exception
      'recipe "%": % kcal stored as a single serving — set typical_portions, or "Ate this" logs the whole batch as one meal',
      new.name, new.calories;
  end if;

  -- MACROS AND macros_computed_at ARE ONE UNIT.
  if new.calories is not null or new.protein_g is not null or new.carbs_g is not null
     or new.fat_g is not null or new.fiber_g is not null
  then
    if new.calories is null or new.protein_g is null or new.carbs_g is null
       or new.fat_g is null or new.fiber_g is null
    then
      raise exception
        'recipe "%": partial macros — calories, protein_g, carbs_g, fat_g and fiber_g must be set together or all be null (the "Eating out" placeholder). Got kcal=%, P=%, C=%, F=%, fib=%',
        new.name, new.calories, new.protein_g, new.carbs_g, new.fat_g, new.fiber_g;
    end if;

    if new.macros_computed_at is null then
      raise exception
        'recipe "%": macros are set but macros_computed_at is null. The UI gates "Ate this" on that column, so this row renders as an unresolved stub and tapping the plan logs NOTHING to meal_log. Stamp macros_computed_at in the same write.',
        new.name;
    end if;
  end if;

  -- The mirror defect: a resolved-at stamp with nothing behind it.
  if new.macros_computed_at is not null and new.calories is null then
    raise exception
      'recipe "%": macros_computed_at is set but there are no macros behind it',
      new.name;
  end if;

  return new;
end;
$$;

drop trigger if exists recipes_check_invariants on public.recipes;

create trigger recipes_check_invariants
  before insert or update of
    ingredients_json, calories, protein_g, carbs_g, fat_g, fiber_g,
    macros_computed_at, typical_portions, name
  on public.recipes
  for each row
  execute function public.recipes_check_invariants();

comment on function public.recipes_check_invariants() is
  'Rejects: spoon-measured ingredients given bare grams; gochujang without grams-as-quantity plus a spoon in its label; rice named so the render-time go annotation cannot fire; batch recipes that never declared typical_portions; partial macros; and macros written without macros_computed_at (which makes the row an unresolved stub whose "Ate this" logs nothing). Applies to every writer including PostgREST. Heat levels in steps_json are advisory only - see audit-recipes.ts.';
