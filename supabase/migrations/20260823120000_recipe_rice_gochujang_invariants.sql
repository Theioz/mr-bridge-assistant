-- Two more recipe invariants, enforced for EVERY writer including PostgREST.
--
-- Both of these rules already existed in prose and both had drifted, which is the same story as
-- 20260813120000. Found 2026-08-23 when Jason spot-checked one recipe:
--
--   * RICE: 9 lines across 5 recipes rendered no `go` at all. The `go` is appended at render time
--     by annotateRice, which matches the RENDERED line ("<n> g dry <grain> rice"). Rows named
--     "Brown rice, long-grain, DRY" read correctly to a human and matched nothing. The defect was
--     invisible precisely because the stored text looked right.
--
--   * GOCHUJANG: all 7 rows were wrong, in two OPPOSITE directions — three had bare grams and no
--     spoon in the label, four had the spoon as the QUANTITY. 20260813120000 exempted gochujang
--     from the spoon rule entirely, which was too blunt: the exemption is about keeping grams for
--     the macro path, not about dropping the volume Jason actually measures with.
--
-- Deliberately NOT enforced here: heat levels in steps_json. That check exists as
-- `timedStepsMissingHeat` in web/scripts/audit-recipes.ts (#673) and is advisory on purpose —
-- detecting "this step applies heat" from prose has a real false-positive rate (17 of 69 on its
-- first run; another 8 of 11 on 2026-08-23), and a trigger that throws on a false positive would
-- block editing a correct recipe. Report it, do not reject it.

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

  return new;
end;
$$;

comment on function public.recipes_check_invariants() is
  'Rejects: spoon-measured ingredients given bare grams; gochujang without grams-as-quantity plus a spoon in its label; rice named so the render-time go annotation cannot fire; and batch recipes that never declared typical_portions. Applies to every writer including PostgREST. Heat levels in steps_json are advisory only - see audit-recipes.ts.';
