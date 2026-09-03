import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Packaged foods: the nutrition label on the box, as photographed.
 *
 * USDA FoodData Central is the right source for whole foods — "chicken breast, raw" is the
 * same food everywhere. For branded packaged goods it is not. USDA's Branded dataset is
 * manufacturer-submitted, so it is incomplete and stale by construction, and both items this
 * module was written against were wrong in it: there is no Barilla record for tri-color
 * rotini (the numerically identical match is a different company's), and the closest record
 * for Classico's sausage sauce overstates protein by 50%.
 *
 * So the label wins for these foods, and this is where it is written down.
 *
 * Everything is stored and returned PER 100 G, matching every other macro path in the app
 * (USDA records, recipes.ingredients_json, metadata.macro_items). The label's per-serving
 * numbers are divided exactly once, in `labelToPer100g`, so no caller re-derives it.
 */

/** Which weight the label's numbers describe. See `prep_state` in the migration. */
export const PREP_STATES = ["as_sold", "dry", "cooked", "drained", "prepared"] as const;
export type PrepState = (typeof PREP_STATES)[number];

export interface PackagedFoodRow {
  id: string;
  brand: string;
  product: string;
  upc: string | null;
  serving_size_g: number;
  serving_label: string | null;
  servings_per_container: number | null;
  net_weight_g: number | null;
  prep_state: PrepState;
  calories_per_100g: number;
  protein_per_100g: number;
  carbs_per_100g: number;
  fat_per_100g: number;
  fiber_per_100g: number | null;
  sugar_per_100g: number | null;
  sodium_mg_per_100g: number | null;
  fdc_proxy_id: number | null;
  label_photographed_on: string;
  notes: string | null;
}

const SELECT =
  "id, brand, product, upc, serving_size_g, serving_label, servings_per_container, " +
  "net_weight_g, prep_state, calories_per_100g, protein_per_100g, carbs_per_100g, " +
  "fat_per_100g, fiber_per_100g, sugar_per_100g, sodium_mg_per_100g, fdc_proxy_id, " +
  "label_photographed_on, notes";

/** Macros for some amount of a food. Same shape the rest of the nutrition code passes around. */
export interface Macros {
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g: number;
  sugar_g: number;
  sodium_mg: number;
}

/** A nutrition panel as printed: per SERVING, which is the only form a label ever comes in. */
export interface LabelPanel {
  servingSizeG: number;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  fiberG?: number | null;
  sugarG?: number | null;
  sodiumMg?: number | null;
}

/** Per-100 g macros, the canonical storage form. */
export interface Per100g {
  calories_per_100g: number;
  protein_per_100g: number;
  carbs_per_100g: number;
  fat_per_100g: number;
  fiber_per_100g: number | null;
  sugar_per_100g: number | null;
  sodium_mg_per_100g: number | null;
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const scale = (v: number | null, factor: number) => (v == null ? 0 : v * factor);

/**
 * Convert a printed panel to per-100 g. The one place the label's serving division happens.
 *
 * Note what this CANNOT fix: FDA rounding. Values under 5 g are printed to the nearest 0.5 g
 * and calories above 50 to the nearest 10, so a 56 g serving reading "200 calories, 1 g fat"
 * is really 195-204 kcal and 0.75-1.25 g. Scaling to a whole box carries that band along —
 * roughly +/- 2.5% on energy. Good enough to beat a wrong-brand USDA record, not a lab assay.
 */
export function labelToPer100g(panel: LabelPanel): Per100g {
  if (!Number.isFinite(panel.servingSizeG) || panel.servingSizeG <= 0) {
    throw new Error("servingSizeG must be a number > 0");
  }
  const f = 100 / panel.servingSizeG;
  return {
    calories_per_100g: round2(panel.calories * f),
    protein_per_100g: round2(panel.proteinG * f),
    carbs_per_100g: round2(panel.carbsG * f),
    fat_per_100g: round2(panel.fatG * f),
    fiber_per_100g: panel.fiberG == null ? null : round2(panel.fiberG * f),
    sugar_per_100g: panel.sugarG == null ? null : round2(panel.sugarG * f),
    sodium_mg_per_100g: panel.sodiumMg == null ? null : round2(panel.sodiumMg * f),
  };
}

/**
 * Macros for an arbitrary weight of the food, in the row's own `prep_state`.
 *
 * The caller is responsible for meaning the same weight the row does. 200 g of a `dry` pasta
 * row is 200 g out of the box, not 200 g on the plate — cooked pasta is mostly absorbed water
 * and weighs roughly 2.5-3x its dry weight, so mixing the two overstates a meal by that much.
 */
export function macrosForGrams(row: PackagedFoodRow, grams: number): Macros {
  if (!Number.isFinite(grams) || grams < 0) throw new Error("grams must be a number >= 0");
  const f = grams / 100;
  return {
    calories: round2(row.calories_per_100g * f),
    protein_g: round2(row.protein_per_100g * f),
    carbs_g: round2(row.carbs_per_100g * f),
    fat_g: round2(row.fat_per_100g * f),
    fiber_g: round2(scale(row.fiber_per_100g, f)),
    sugar_g: round2(scale(row.sugar_per_100g, f)),
    sodium_mg: round2(scale(row.sodium_mg_per_100g, f)),
  };
}

/** Macros for N label servings. Convenience for "I ate two servings" without gram maths. */
export function macrosForServings(row: PackagedFoodRow, servings: number): Macros {
  return macrosForGrams(row, row.serving_size_g * servings);
}

/**
 * The weight of a whole container, and which figure it came from.
 *
 * `net_weight_g` wins when present. Falling back to servings x serving_size is genuinely
 * lossy: "about 5 servings" is itself rounded, so a 24 oz (680 g) jar labelled 5 x 125 g
 * reconstructs as 625 g — 8% light, which is most of a portion across a batch cook. The
 * `source` field is returned so a caller can say the number is inferred rather than read.
 */
export function containerWeightG(
  row: PackagedFoodRow,
): { grams: number; source: "net_weight" | "servings" } | null {
  if (row.net_weight_g != null) return { grams: row.net_weight_g, source: "net_weight" };
  if (row.servings_per_container != null) {
    return { grams: row.servings_per_container * row.serving_size_g, source: "servings" };
  }
  return null;
}

/** The whole catalog, brand then product — the order a person scans a shelf in. */
export async function listPackagedFoods(
  db: SupabaseClient,
  userId: string,
): Promise<PackagedFoodRow[]> {
  const { data, error } = await db
    .from("packaged_foods")
    .select(SELECT)
    .eq("user_id", userId)
    .order("brand", { ascending: true })
    .order("product", { ascending: true });

  if (error) throw new Error(`packaged_foods query failed: ${error.message}`);
  return (data ?? []) as PackagedFoodRow[];
}

/**
 * Look one up. Barcode first when there is one, because it is the only identity a packaged
 * good keeps across a box redesign; name matching is the fallback and is case- and
 * whitespace-insensitive to match the unique index.
 */
export async function findPackagedFood(
  db: SupabaseClient,
  userId: string,
  key: { upc?: string | null; brand?: string; product?: string },
): Promise<PackagedFoodRow | null> {
  let q = db.from("packaged_foods").select(SELECT).eq("user_id", userId).limit(1);

  if (key.upc) {
    q = q.eq("upc", key.upc);
  } else if (key.brand && key.product) {
    q = q.ilike("brand", key.brand.trim()).ilike("product", key.product.trim());
  } else {
    throw new Error("findPackagedFood needs a upc, or both brand and product");
  }

  const { data, error } = await q;
  if (error) throw new Error(`packaged_foods lookup failed: ${error.message}`);
  return (data?.[0] as PackagedFoodRow | undefined) ?? null;
}
