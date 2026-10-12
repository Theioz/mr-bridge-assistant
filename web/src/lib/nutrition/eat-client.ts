import type { EatTarget } from "./next-meal";

export type EatResult = { ok: true } | { ok: false; error: string };

/**
 * The browser side of "Ate this": POST /api/meals/eat, one portion.
 *
 * Extracted from KitchenPanel so the dashboard's Today's food section logs through the SAME
 * request — one write path into meal_log (which also draws down the cook and marks the plan
 * satisfied server-side), not a second one that could drift from it.
 */
export async function postEat(
  target: EatTarget,
  opts: { mealType?: string; mealPlanId?: string } = {},
): Promise<EatResult> {
  try {
    const res = await fetch("/api/meals/eat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...(target.kind === "cook" ? { cook_id: target.cookId } : { recipe_id: target.recipeId }),
        portions: 1,
        meal_type: opts.mealType,
        meal_plan_id: opts.mealPlanId,
      }),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      return { ok: false, error: body.error ?? "Couldn't log that" };
    }
    return { ok: true };
  } catch {
    return { ok: false, error: "Couldn't log that" };
  }
}
