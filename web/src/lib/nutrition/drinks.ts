/**
 * Alcohol arithmetic — the one place a drink becomes numbers.
 *
 * Pure and I/O-free so the `log_drink` tool, the scorecard and their tests all share it. A drink's
 * ethanol is fully determined by its volume and ABV, so nothing here is estimated: that is why a
 * drink may be logged by a tool at all, when every other food must go through USDA or a label.
 *
 * Constants: ethanol density 0.789 g/ml; a US standard drink is 14 g of ethanol; ethanol yields
 * 7 kcal/g. Calories from residual sugar are NOT here — they come from the label's carbs, which
 * the caller adds (a sweet RTD and a dry wine of the same ABV differ ~2x in kcal).
 */

const ETHANOL_G_PER_ML = 0.789;
const GRAMS_PER_STANDARD_DRINK = 14;
const KCAL_PER_G_ETHANOL = 7;

function assertDrink(volumeMl: number, abvPct: number): void {
  if (!Number.isFinite(volumeMl) || volumeMl < 0) {
    throw new Error(`volume_ml must be a non-negative number (got ${volumeMl})`);
  }
  if (!Number.isFinite(abvPct) || abvPct < 0 || abvPct > 100) {
    throw new Error(`abv_pct must be between 0 and 100 (got ${abvPct})`);
  }
}

/** Grams of ethanol in a drink, unrounded. */
export function ethanolGrams(volumeMl: number, abvPct: number): number {
  assertDrink(volumeMl, abvPct);
  return volumeMl * (abvPct / 100) * ETHANOL_G_PER_ML;
}

/** US standard drinks (14 g ethanol), rounded to 2 dp — the precision of meal_log.standard_drinks. */
export function standardDrinks(volumeMl: number, abvPct: number): number {
  return Math.round((ethanolGrams(volumeMl, abvPct) / GRAMS_PER_STANDARD_DRINK) * 100) / 100;
}

/** Calories from the ethanol alone, rounded to a whole kcal. */
export function ethanolKcal(volumeMl: number, abvPct: number): number {
  return Math.round(ethanolGrams(volumeMl, abvPct) * KCAL_PER_G_ETHANOL);
}
