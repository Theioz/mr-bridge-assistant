-- ---------------------------------------------------------------------------
-- Every planned meal must be backed by a recipe or a cook.
--
-- A meal_plans row with neither recipe_id nor cook_id is a bare label — no
-- instructions, no macros, nothing the "Ate this" flow or the planner can use.
-- This enforces "when we plan a meal, there must be a recipe attached" at the
-- database level, so no write path (app, MCP tool, script, or direct) can create
-- a freeform plan. A meal out is planned against the reusable "Eating out" recipe.
--
-- NOT VALID: applied without re-checking pre-existing rows (a couple of legacy
-- eaten freeform plans predate this rule and are left as historical record). All
-- new inserts and any update are enforced.
-- ---------------------------------------------------------------------------

alter table meal_plans drop constraint if exists meal_plans_recipe_or_cook_required;
alter table meal_plans
  add constraint meal_plans_recipe_or_cook_required
  check (recipe_id is not null or cook_id is not null) not valid;
