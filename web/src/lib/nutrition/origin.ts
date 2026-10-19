/**
 * meal_log.origin — where the food came from. The column's CHECK constraint holds the same four
 * values; validating here turns a typo into a 400 instead of a 500 from Postgres.
 */
export const MEAL_ORIGINS = ["home", "restaurant", "delivery", "travel"] as const;
export type MealOrigin = (typeof MEAL_ORIGINS)[number];

/**
 * Parse an optional origin from a request body. `undefined`/`null` → no origin (the column stays
 * null, meaning unknown); anything else must be one of MEAL_ORIGINS.
 */
export function parseOrigin(
  raw: unknown,
): { ok: true; origin: MealOrigin | null } | { ok: false; error: string } {
  if (raw == null) return { ok: true, origin: null };
  if (typeof raw === "string" && (MEAL_ORIGINS as readonly string[]).includes(raw)) {
    return { ok: true, origin: raw as MealOrigin };
  }
  return { ok: false, error: `origin must be one of ${MEAL_ORIGINS.join(", ")}` };
}
