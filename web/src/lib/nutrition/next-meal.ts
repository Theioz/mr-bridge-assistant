// Which planned meal is "next", and can it be logged in one tap?
//
// Pure, shared by KitchenPanel (the Meals page) and the dashboard's Today's food section, so the
// two can never disagree about whether a plan row has an "Ate this" button.

/**
 * The meal_plans select that hydrates a KitchenPlannedMeal (components/meals/KitchenPanel.tsx):
 * the plan row plus the recipe or cook it points at. Shared by the Meals page and the dashboard.
 */
export const MEAL_PLAN_SELECT =
  "id, date, meal_type, portions, status, name, " +
  "recipes(id, name, ingredients, instructions, ingredients_json, steps_json, " +
  "calories, protein_g, carbs_g, fat_g, fiber_g, " +
  "typical_portions, macros_confidence, macros_computed_at), " +
  "cooks(id, name, portions, portions_remaining, calories, protein_g, carbs_g, fat_g, fiber_g)";

/** Display/eating order of meal types. Matches KitchenPanel. */
export const MEAL_ORDER = ["breakfast", "lunch", "dinner", "snack"] as const;

function rank(mealType: string): number {
  const i = (MEAL_ORDER as readonly string[]).indexOf(mealType);
  return i === -1 ? MEAL_ORDER.length : i;
}

/**
 * The earliest still-`planned` meal today whose meal type has not been logged yet.
 *
 * A meal type that already has a meal_log row today is treated as done even if the plan row
 * still says `planned` (lunch eaten off-plan): suggesting "Ate this" for it would double-log.
 */
export function pickNextPlannedMeal<T extends { meal_type: string; status: string }>(
  plans: ReadonlyArray<T>,
  loggedMealTypes: Iterable<string | null | undefined>,
): T | null {
  const logged = new Set<string>();
  for (const t of loggedMealTypes) if (t) logged.add(t);
  const open = plans
    .filter((p) => p.status === "planned" && !logged.has(p.meal_type))
    .sort((a, b) => rank(a.meal_type) - rank(b.meal_type));
  return open[0] ?? null;
}

export interface EatablePlan {
  cooks: { id: string; portions_remaining: number } | null;
  recipes: { id: string; macros_computed_at: string | null } | null;
}

export type EatTarget = { kind: "cook"; cookId: string } | { kind: "recipe"; recipeId: string };

/**
 * What one-tap "Ate this" (POST /api/meals/eat) would log for this plan row, or null when it has
 * no macros to log.
 *
 * - cook-backed with a portion left → eat from the cook
 * - recipe-backed with resolved macros (macros_computed_at set) → cook-and-eat the recipe
 * - otherwise null: a freeform plan or a name-only recipe stub. Those can only be marked by status,
 *   which writes no meal_log row — so the dashboard does not offer it at all (a plan row is never
 *   marked eaten without a meal_log row behind it; see feedback_mrbridge_plan_status_is_not_evidence).
 */
export function eatTargetFor(plan: EatablePlan): EatTarget | null {
  const cook = plan.cooks;
  if (cook) return cook.portions_remaining > 0 ? { kind: "cook", cookId: cook.id } : null;
  const recipe = plan.recipes;
  if (recipe && recipe.macros_computed_at) return { kind: "recipe", recipeId: recipe.id };
  return null;
}
