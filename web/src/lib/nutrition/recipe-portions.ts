/**
 * Portion arithmetic for recipe macros.
 *
 * SPLIT OUT OF `recipe-macros.ts` DELIBERATELY, and the reason is testability rather than tidiness.
 * `recipe-macros.ts` imports `./estimate`, which reaches USDA and Ollama; the repo's unit tests run
 * on `node --experimental-strip-types --test` with no bundler and no install step, so importing
 * that module from a test fails at resolution. The one line that decides whether a health log
 * receives 594 kcal or 1783 has to be reachable by a test that actually runs, so it lives here in
 * a leaf module with no runtime imports.
 */

export interface RecipeMacroTotals {
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g: number;
  confidence: "high" | "medium" | "low";
  notes: string;
}

/** The five numeric macro fields — the ones that scale with portion size. `confidence` and
 *  `notes` describe the resolve itself and are not divisible, which is why they are excluded. */
export type MacroKey = "calories" | "protein_g" | "carbs_g" | "fat_g" | "fiber_g";

export function perPortion(
  total: Pick<RecipeMacroTotals, MacroKey>,
  portions: number,
): Pick<RecipeMacroTotals, MacroKey> {
  const div = (n: number) => Math.round((n / portions) * 10) / 10;
  return {
    calories: Math.round(total.calories / portions),
    protein_g: div(total.protein_g),
    carbs_g: div(total.carbs_g),
    fat_g: div(total.fat_g),
    fiber_g: div(total.fiber_g),
  };
}

/**
 * Decide what actually gets written to `recipes.calories` and friends.
 *
 * A null, absent, zero or 1 portion count all mean "the list is one serving" and pass `total`
 * through untouched — importantly the SAME object, so a non-batch recipe is byte-identical to its
 * pre-2026-08-13 behaviour. Fractional or negative values are treated as 1 rather than trusted:
 * dividing by 0.5 would double a plate, and there is no sane reading of a negative. A bad value
 * has to degrade to inert, never to a multiplier, because the output is a health log.
 */
export function storedMacrosFor(
  total: RecipeMacroTotals,
  typicalPortions: number | null | undefined,
): { portions: number; stored: Pick<RecipeMacroTotals, MacroKey> } {
  const valid =
    typeof typicalPortions === "number" && Number.isFinite(typicalPortions) && typicalPortions > 1;
  const portions = valid ? Math.floor(typicalPortions) : 1;
  return { portions, stored: portions > 1 ? perPortion(total, portions) : total };
}
