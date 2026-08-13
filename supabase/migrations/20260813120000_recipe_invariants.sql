-- Enforce two recipe invariants in the DATABASE, not just in the API route.
--
-- WHY HERE AND NOT ONLY IN parseIngredientRows
--
-- The TypeScript guard added in #670 covers POST /api/recipes and PATCH /api/recipes/[id] — the
-- app's own editor. It does not cover anything talking to PostgREST with the service key, which is
-- how every assistant- and script-written recipe has ever been created. That is the path that
-- produced all of the defects these rules exist to prevent:
--
--   * the spoon rule was applied by hand across 25 recipes on 2026-07-31 and every recipe written
--     afterwards ignored it, twice, until a human noticed;
--   * six recipes stored a WHOLE BATCH against a per-meal reading, so "Ate this" logged the entire
--     cook as one sitting — up to 4,646 kcal in a single meal_log row.
--
-- A rule enforced only on the path that never broke it is not enforcement. These run on every
-- writer, including psql.
--
-- WHAT IS DELIBERATELY *NOT* ENFORCED: fdc_id pinning. 45 ingredient lines are still unpinned
-- because their food genuinely has no safe USDA match (gochujang has no record at all; "cod, cooked
-- weight" needs a prep-state judgement). A NOT NULL rule would block editing those recipes at all.
-- scripts/audit-recipes.ts reports them instead — visible, not fatal.

create or replace function public.recipes_check_invariants()
returns trigger
language plpgsql
as $$
declare
  ing        jsonb;
  item_text  text;
  unit_text  text;
  qty        numeric;
begin
  if new.ingredients_json is not null and jsonb_typeof(new.ingredients_json) = 'array' then
    for ing in select * from jsonb_array_elements(new.ingredients_json)
    loop
      item_text := lower(coalesce(ing->>'item', ''));
      unit_text := ing->>'unit';
      -- A non-numeric quantity is a different defect with its own error; ignore it here.
      begin
        qty := nullif(ing->>'quantity', '')::numeric;
      exception when others then
        qty := null;
      end;

      -- Gochujang is exempt: it has NO USDA record, so no portion table exists to resolve a volume
      -- against, and writing "1 tbsp" would leave a re-resolve with no way back to grams. It keeps
      -- grams and carries the spoon in its label.
      if unit_text = 'g'
         and qty is not null and qty > 0
         and item_text !~ 'gochujang'
         and item_text ~ '(avocado|olive|sesame|cooking|vegetable) oil|tomato paste|soy sauce|shoyu|tamari|peanut butter|flaxseed'
      then
        raise exception
          'recipe "%": ingredient "%" is measured by spoon, not weighed — give a volume (tsp/tbsp) and keep the grams in the item label',
          new.name, ing->>'item';
      end if;
    end loop;
  end if;

  -- An undeclared batch stores the whole cook where every consumer expects one serving. The ceiling
  -- is set from the library's real spread: the largest genuine single plate is ~1,050 kcal (the
  -- ribeye) and the smallest real batch was 1,562, so 1,200 separates them without a false positive.
  if coalesce(new.calories, 0) > 1200 and coalesce(new.typical_portions, 1) <= 1 then
    raise exception
      'recipe "%": % kcal stored as a single serving — set typical_portions, or "Ate this" logs the whole batch as one meal',
      new.name, new.calories;
  end if;

  return new;
end;
$$;

drop trigger if exists recipes_check_invariants on public.recipes;

create trigger recipes_check_invariants
  before insert or update of ingredients_json, calories, typical_portions, name
  on public.recipes
  for each row
  execute function public.recipes_check_invariants();

comment on function public.recipes_check_invariants() is
  'Rejects spoon-measured ingredients given a bare gram quantity, and batch recipes that never declared typical_portions. Applies to every writer including PostgREST, which the API-layer guard in #670 does not cover.';
