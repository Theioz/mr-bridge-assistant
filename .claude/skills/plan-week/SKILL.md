---
name: plan-week
description: Plan the coming week's training and meals together. Reads recovery, recent training, body-comp trend, macro targets, leftovers and the recipe library; writes the workout plan and the meal plan; emits a grocery list and prep tasks. Use when the user says "plan my week", "plan next week", "let's do the weekly plan", or at the start of a Sunday planning session.
---

# Weekly plan — training and food, together

The point of doing these in one pass is that they are one system: what you cook on Sunday
depends on how many sessions you're training, and what you can train depends on how you
recovered. Planned separately they drift apart within a week.

## Ground rules

**Never invent a macro number.** You choose *what* is cooked and eaten; USDA FoodData
Central decides what is in it. `plan_meals` and `log_cook` have no macro fields on purpose.
If a recipe has `macros_computed_at: null` it has never been resolved and **cannot be
planned against a target** — say so and offer to resolve it, don't guess its calories.

**Portions are eyeballed, and that is the error bar.** The user cooks a pile of food and
splits it into however many containers they feel like. No amount of USDA precision rescues a
container that's 20% bigger than its neighbour. These numbers are for direction across weeks,
not lab accuracy. Don't present them to more precision than they deserve, and don't build
arguments that depend on ±50 kcal.

**Macro targets are flat.** They do not flex with training load — that was a deliberate
decision. Training drives *timing* (eat around the session) and *prep volume* (how many
containers you need), not amounts.

## Sequence

### 1. Read before proposing anything

Run these together — they're independent:

- `get_leftovers` — **do this first.** Food that already exists costs no shopping and no
  cooking. Proposing a grocery run while a tray of turkey pasta goes off is the fastest way
  to make a plan feel stupid. Note the ages: leftovers older than ~4 days are a question,
  not an ingredient.
- `get_fitness_summary` — recovery (readiness, HRV, resting HR) and body-comp trend.
- `get_workout_history` — what actually happened last week, not what was planned.
- `get_meal_history` — what was actually eaten. **Off-plan meals are not failures**; they're
  the signal. If the same slot went off-plan three times, the plan is wrong about that slot.
- `get_profile` — macro targets.
- `get_recipes` — the library, with macros.
- `get_user_equipment` — what they can actually train with.
- `list_calendar_events` for the week — a 7pm meeting is why Tuesday's session moves, and a
  restaurant booking is why Thursday dinner is a meal out.

### 2. Training

Compare last week's *planned* vs *actual* (`get_workout_plan` vs `get_workout_history`).
A session that was skipped twice at the same time of day is a scheduling problem, not a
motivation problem — move it.

Weigh recovery honestly. Readiness below 70 means deload the hardest session, not "push
through". Below 50 means a rest day.

Then `assign_workout` per training day. It also creates/updates the Google Calendar event
unless `update_calendar: false` — so first settle the start time and check that day's
`list_calendar_events` for clashes, as the tool's description requires.

### 3. Food

In this order — the order matters, it's what keeps the plan cheap:

1. **Eat down the fridge.** Assign existing leftover portions to slots with `plan_meals`
   (`cook_id`). Oldest first.
2. **Fill the rest from the recipe library**, biased toward what batches well. Several days
   pointing at the same recipe *is* the batch — there is no separate "planned cook" object.
3. **Meals out for the slots that aren't yours** — restaurants, meals with other people. Plan
   the reusable **"Eating out"** recipe (find it with `get_recipes`); a `name` with no
   `cook_id`/`recipe_id` is rejected. The real macros get logged afterward. Pretending you can
   plan them is how a plan loses credibility.

**The prep system.** Two preps a week (Sun + Wed by default), each built from ONE formula:
1 lean protein + 1 carb + 2 vegetables + 1 sauce, cooked as 4-5 portions with 2 frozen as
backups. A frozen portion is what makes a tired night a microwave instead of a delivery order.
Rotate formulas across preps so no plate runs more than 3 days in a row; swap the sauce
before swapping the formula. Frozen vegetables are fine and spoil less.

**Plate limits.** About 600 g of food and about 15 g of fibre per plate. When a plate needs
calories, add density (rice, beans, a measured oil), never more vegetable bulk — a plate too
big to finish is a worse outcome than a smaller one.

**The day shape** follows the `profile` macro targets and eating window: lunch (a prep plate),
an early-afternoon snack box (eggs boiled on prep day, or jerky, plus edamame or carrots and a
piece of fruit), dinner, and whey only to close a protein gap.

**The cheat meal.** Plan exactly `cheat_meals_per_week` (profile, default 1) rows with
`is_cheat: true`. It is budgeted into the week, not earned, and the next day is planned as a
normal day — never a compensating low day.

**Travel.** On days a "Stay at ..." calendar event covers, plan no prep and no deficit: the
target is maintenance, a protein floor, and "Eating out" rows. A trip is a diet break, not a
lapse.

Sanity-check the daily totals against the flat target using recipe macros ÷ intended
portions. If a day is well short on protein, fix it by changing *what* is planned, never by
asserting a number.

### 4. Hand off the work

The plan is useless if the food doesn't get made. Emit, via `add_task`:

- **A grocery list** — call `get_grocery_list` for the planned window; do not add ingredients
  up by hand. It scales each recipe by planned portions, subtracts `inventory_items`, and
  rounds to whole packs of each food's pinned Amazon Fresh product. Read three things before
  writing the task:
  - `unlisted` — recipes with no structured ingredients contribute NOTHING. Name them and
    shop for them by hand; a list with a non-empty `unlisted` is incomplete.
  - `needsPin` lines — no product yet. Do not pick one silently: ask, then `pin_grocery_product`.
  - `check-stock` lines — the kitchen has some but in a unit with no weight. Ask before buying.
  One task, itemised. Then offer to fill the Amazon Fresh cart with the `amazon-cart` skill
  (it never checks out).
- **Prep tasks** — one per cook, naming the portion count and what it covers:
  "Cook turkey pasta — split 3 ways, covers Mon/Tue/Wed lunch."

The portion count is a *proposal*. The user does the splitting and only they know how it
came out — they confirm the real number when they log the cook.

## Then say what you did, briefly

Lead with the week's shape, not a table dump: how many sessions, what the hardest day is,
what's already in the fridge, what needs buying. The detail is in the app; the summary is
what makes it actionable.

Flag honestly if anything is off: a recipe with no macros, a leftover that will go bad before
its slot, a day whose protein target can't be hit from the library as it stands.
