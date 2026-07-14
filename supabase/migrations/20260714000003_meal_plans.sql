-- Meal coordination, part 2: a forward plan for food.
--
-- workout_plans has existed since April and is fully writable from Claude Code
-- (assign_workout, reschedule_workout, ...). Food had no equivalent — there was no object
-- that could say "Thursday lunch is a portion of the turkey pasta you cooked Sunday". That
-- asymmetry is why training could be programmed and eating could not.
--
-- A planned meal is one of exactly three things, and the distinction matters because they
-- imply different work:
--
--   cook_id set     Eat a portion of food that ALREADY EXISTS. No shopping, no cooking.
--                   This is the leftovers case, and the planner should exhaust it first.
--   recipe_id set   Cook this. Implies groceries, and implies a cook row when it happens.
--   neither         Freeform — "dinner out", "leftovers from Mum's". Carries no macros and
--                   pretends to none.
--
-- Deliberately NOT modelled: a separate "planned cook" object. Several days pointing at the
-- same recipe IS the batch — the prep task ("cook turkey pasta, split 3 ways") is generated
-- from that, not stored as its own row. One fewer thing to keep in sync.

create table if not exists meal_plans (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,

  date       date not null,
  meal_type  text not null
             constraint meal_plans_meal_type_valid
             check (meal_type in ('breakfast', 'lunch', 'dinner', 'snack')),

  -- Exactly one of these, or neither (freeform). Never both: eating a portion of an existing
  -- cook and cooking the recipe fresh are different days of work.
  cook_id    uuid references cooks (id) on delete set null,
  recipe_id  uuid references recipes (id) on delete set null,
  constraint meal_plans_one_source check (not (cook_id is not null and recipe_id is not null)),

  -- Freeform label, and the only thing a plan carries when it has no cook or recipe.
  name       text,
  constraint meal_plans_freeform_needs_name
    check (cook_id is not null or recipe_id is not null or name is not null),

  portions   numeric(4, 2) not null default 1
             constraint meal_plans_portions_positive check (portions > 0),

  -- A plan is a proposal, not a record. What actually happened lives in meal_log; this only
  -- tracks whether the proposal was taken up, so next week's plan can learn from the misses.
  status     text not null default 'planned'
             constraint meal_plans_status_valid
             check (status in ('planned', 'eaten', 'skipped')),

  notes      text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- One plan per slot. Re-planning a slot updates it rather than stacking duplicates.
  constraint meal_plans_user_date_type_unique unique (user_id, date, meal_type)
);

create index if not exists meal_plans_user_date_idx on meal_plans (user_id, date);

comment on table meal_plans is
  'Proposed meals. A plan is a proposal, not a record — what was actually eaten is meal_log. '
  'Carries no macros of its own: they are read through cook_id or recipe_id, both of which '
  'are USDA-derived. There is deliberately nowhere here for a model to write a macro number.';
comment on column meal_plans.cook_id is
  'Eat a portion of food that already exists (leftovers). The planner should exhaust these '
  'before proposing anything that requires shopping.';

alter table meal_plans enable row level security;

drop policy if exists meal_plans_owner_all on meal_plans;
create policy meal_plans_owner_all on meal_plans
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Link a logged meal back to the plan it satisfied, so planned-vs-actual is answerable
-- without guessing by date and meal type.
alter table meal_log
  add column if not exists meal_plan_id uuid references meal_plans (id) on delete set null;

comment on column meal_log.meal_plan_id is
  'The plan this meal satisfied, if any. Null means it was off-plan — which is normal and '
  'is itself the signal the next plan should learn from.';
