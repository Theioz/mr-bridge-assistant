/**
 * Meal estimation: local model identifies, USDA quantifies.
 *
 * Pipeline per food:
 *   parse (model)  ->  search USDA  ->  pick best (model)  ->  qty+unit -> grams
 *   (USDA portions) -> per-100g macros scaled to grams (USDA)
 *
 * The model never produces a number that ends up in your macros. It only decides
 * WHICH food and HOW MANY units. Every gram and every calorie comes from USDA
 * measured data. This replaces an Anthropic call that recalled nutrition facts
 * from memory — it is more accurate, not less.
 */
import {
  addMacros,
  EMPTY_MACROS,
  getFood,
  gramsFor,
  macrosForGrams,
  roundMacros,
  searchFoods,
  type Macros,
} from "./fdc";
import { parseFoodPhoto, parseFoodText, pickBestFood, type ParsedFood } from "./parse";

export type EstimatedItem = {
  /** What the user said / the model saw. */
  input: string;
  /** The USDA food we actually used. */
  matched: string;
  fdcId: number;
  qty: number;
  unit: string;
  grams: number;
  /** false when we fell back to an assumed portion weight. */
  exactPortion: boolean;
  basis: string;
  macros: Macros;
};

export type MealEstimate = {
  food_name: string;
  items: EstimatedItem[];
  totals: Macros;
  confidence: "high" | "medium" | "low";
  notes: string;
};

async function estimateOne(food: ParsedFood, context?: string): Promise<EstimatedItem | null> {
  const candidates = await searchFoods(food.query, 5);
  if (candidates.length === 0) return null;

  // Never blind-trust candidates[0] — USDA's top hit for "chicken breast, cooked"
  // is breaded microwaved tenders (252 kcal vs ~165 for plain).
  let idx: number | null = null;
  try {
    idx = await pickBestFood(food.query, candidates, context);
  } catch {
    idx = null; // model unavailable -> fall through to first hit, flagged low-confidence
  }
  const chosen = candidates[idx ?? 0];

  const detail = await getFood(chosen.fdcId);
  const { grams, exact, basis } = gramsFor(food.qty, food.unit, detail.portions);

  return {
    input: `${food.qty} ${food.unit} ${food.query}`.trim(),
    matched: detail.description,
    fdcId: detail.fdcId,
    qty: food.qty,
    unit: food.unit,
    grams: Math.round(grams),
    exactPortion: exact && idx !== null,
    basis,
    macros: macrosForGrams(detail.per100g, grams),
  };
}

function assemble(items: EstimatedItem[], label: string): MealEstimate {
  const totals = items.reduce<Macros>((acc, i) => addMacros(acc, i.macros), { ...EMPTY_MACROS });

  // Confidence reflects what actually happened, not a vibe:
  //  high   — every portion resolved against real USDA portion data
  //  medium — some portions fell back to an assumed weight
  //  low    — nothing matched
  const assumed = items.filter((i) => !i.exactPortion).length;
  const confidence: MealEstimate["confidence"] =
    items.length === 0 ? "low" : assumed === 0 ? "high" : assumed < items.length ? "medium" : "low";

  const notes =
    assumed === 0
      ? "All portions resolved from USDA measured portion data."
      : `${assumed} of ${items.length} portion(s) used an assumed serving weight — adjust below if that's off.`;

  return {
    food_name: label,
    items,
    totals: roundMacros(totals),
    confidence,
    notes,
  };
}

/** Free-text: "2 eggs and toast" */
export async function estimateFromText(text: string, label?: string): Promise<MealEstimate> {
  const foods = await parseFoodText(text);
  const settled = await Promise.all(foods.map((f) => estimateOne(f, text).catch(() => null)));
  const items = settled.filter((i): i is EstimatedItem => i !== null);
  return assemble(items, label?.trim() || text.trim());
}

/** Photo of a meal. */
export async function estimateFromPhoto(base64Jpeg: string, label?: string): Promise<MealEstimate> {
  const foods = await parseFoodPhoto(base64Jpeg);
  const settled = await Promise.all(foods.map((f) => estimateOne(f).catch(() => null)));
  const items = settled.filter((i): i is EstimatedItem => i !== null);
  const name = label?.trim() || items.map((i) => i.matched.split(",")[0]).join(", ") || "Meal";
  return assemble(items, name);
}
