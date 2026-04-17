-- Close the two remaining multi-tenant unique-constraint gaps from the original
-- multitenancy migration (20260413000002). Both are #133-class hazards: without
-- user_id in the key, upserts from one user can merge/collide with another.
--
-- habits: (habit_id, date) → (user_id, habit_id, date)
--   habit_id already uniquely identifies the owner through its FK to habit_registry,
--   but explicit user_id in the key prevents cross-user upsert targeting.
--
-- meal_log: no unique constraint at all → (user_id, date, meal_type, recipe_id)
--   Makes seeding idempotent (today's repeated upsert of "lunch + Chicken Bowl"
--   updates rather than duplicates). recipe_id is nullable; Postgres treats NULLs
--   as distinct, so ad-hoc meals (recipe_id IS NULL) do not collide on the same
--   day/meal_type — matching the user's real logging pattern where they might
--   eat the saved-recipe lunch AND a second ad-hoc lunch.

alter table habits drop constraint if exists habits_habit_id_date_key;
alter table habits
  add constraint habits_user_id_habit_id_date_key
  unique (user_id, habit_id, date);

alter table meal_log
  add constraint meal_log_user_id_date_meal_type_recipe_id_key
  unique (user_id, date, meal_type, recipe_id);
