// Macros for a quantity of an inventory row, from the per-100g cache on the row.
//
// WHY A CACHE AND NOT A LIVE LOOKUP
//
// The fridge view renders ~40 rows at once. Resolving each `fdc_id` through the FDC API would
// be ~21 round-trips on one page load. `macros_per_100g` is written when the pin is set and is
// DERIVED — `fdc_id` / `packaged_food_id` remain the provenance and the cache is recomputable
// from them at any time.
//
// WHAT THIS DELIBERATELY REFUSES TO DO
//
// A row whose unit is not a weight (`can`, `jar`, `box`, `each`, `bottle`) gets NO macros here,
// even though its pin resolves fine. Converting "3 can" to grams needs a per-container weight
// this table does not carry, and inventing one is the failure the nutrition rules exist to stop
// — the recipes state those conversions (a 15.5 oz can of kidney beans is 270 g drained) and
// that is where they belong. Showing "unknown" is correct; showing a guess is not.

export interface Per100g {
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g: number | null;
  sugar_g: number | null;
  sodium_mg: number | null;
  basis?: string;
  prep_state?: string | null;
}

export interface ResolvedMacros {
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g: number | null;
  sugar_g: number | null;
  sodium_mg: number | null;
}

/** Units that are a mass we can scale from. Everything else is a count of containers. */
const GRAM_UNITS: Record<string, number> = {
  g: 1,
  gram: 1,
  grams: 1,
  kg: 1000,
  oz: 28.3495,
  lb: 453.592,
  lbs: 453.592,
};

export function gramsOf(quantity: number | null, unit: string | null): number | null {
  if (quantity == null || !Number.isFinite(quantity) || quantity < 0) return null;
  const f = GRAM_UNITS[(unit ?? "").trim().toLowerCase()];
  return f === undefined ? null : quantity * f;
}

const r1 = (n: number) => Math.round(n * 10) / 10;
const scale = (v: number | null | undefined, f: number) => (v == null ? null : r1(v * f));

export function macrosForItem(
  per100g: Per100g | null | undefined,
  quantity: number | null,
  unit: string | null,
): ResolvedMacros | null {
  if (!per100g) return null;
  const grams = gramsOf(quantity, unit);
  if (grams == null) return null;
  const f = grams / 100;
  return {
    calories: Math.round(per100g.calories * f),
    protein_g: r1(per100g.protein_g * f),
    carbs_g: r1(per100g.carbs_g * f),
    fat_g: r1(per100g.fat_g * f),
    fiber_g: scale(per100g.fiber_g, f),
    sugar_g: scale(per100g.sugar_g, f),
    sodium_mg: scale(per100g.sodium_mg, f),
  };
}

/**
 * Why a row shows no macros. The view says this out loud rather than rendering a silent blank,
 * because "we don't know" and "it has none" are different facts and a dash conflates them.
 */
export function macroGap(
  per100g: Per100g | null | undefined,
  quantity: number | null,
  unit: string | null,
): string | null {
  if (!per100g) return "No macro source pinned";
  // Order matters. A NULL quantity is an untracked STAPLE (rice, oil, whey) that is assumed on
  // hand — its unit may well be grams, so testing the unit first would report "counted in g",
  // which is both wrong and confusing. Quantity first, then unit.
  if (quantity == null) return "Untracked staple — no amount recorded";
  if (gramsOf(quantity, unit) == null) {
    return unit ? `Counted in ${unit}, not weighed` : "No unit recorded";
  }
  return null;
}
