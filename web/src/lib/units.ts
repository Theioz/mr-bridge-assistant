export type WeightUnit = "kg" | "lb";

const LB_PER_KG = 2.2046226218;

export function kgToDisplay(kg: number | null | undefined, unit: WeightUnit): number | null {
  if (kg == null || Number.isNaN(kg)) return null;
  if (unit === "kg") return round(kg, 1);
  return round(kg * LB_PER_KG, 1);
}

export function displayToKg(value: number | null | undefined, unit: WeightUnit): number | null {
  if (value == null || Number.isNaN(value)) return null;
  if (unit === "kg") return round(value, 3);
  return round(value / LB_PER_KG, 3);
}

export function formatWeight(kg: number | null | undefined, unit: WeightUnit): string {
  const display = kgToDisplay(kg, unit);
  if (display == null) return "—";
  return `${display} ${unit}`;
}

export function parseWeightUnit(raw: string | null | undefined): WeightUnit {
  return raw === "kg" ? "kg" : "lb";
}

function round(n: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(n * factor) / factor;
}

// ── Ingredient-text weight conversions ──────────────────────────────────────────
// Recipes are written in grams (USDA); the fridge is stocked in lb/oz. Showing a gram amount
// without its imperial equivalent forces a mental conversion that is easy to get wrong ("we have
// 1.25 lb of chicken but the recipe says 200 g"). `addWeightConversions` annotates each weight in
// a free-text ingredient list with its other units, leaving the stored text unchanged.

const GRAMS_PER: Record<string, number> = {
  g: 1,
  gram: 1,
  grams: 1,
  kg: 1000,
  oz: 28.3495,
  ounce: 28.3495,
  ounces: 28.3495,
  lb: 453.592,
  lbs: 453.592,
  pound: 453.592,
  pounds: 453.592,
};
const G_FAMILY = new Set(["g", "gram", "grams", "kg"]);
const OZ_FAMILY = new Set(["oz", "ounce", "ounces"]);
const LB_FAMILY = new Set(["lb", "lbs", "pound", "pounds"]);

// Below this, an ounce figure is more noise than help (5 g of oil → "0.2 oz").
const MIN_GRAMS_FOR_OZ = 15;

// Leading "<number> <weight-unit>" on a line, e.g. "200 g raw chicken thigh".
const LEADING_WEIGHT = /^(\s*\d+(?:\.\d+)?\s*)(g|grams?|kg|oz|ounces?|lb|lbs|pounds?)\b/i;

function annotateLine(line: string): string {
  const m = line.match(LEADING_WEIGHT);
  if (!m) return line;
  const key = m[2].toLowerCase();
  const grams = parseFloat(m[1]) * GRAMS_PER[key];

  const alts: string[] = [];
  if (!G_FAMILY.has(key)) alts.push(`${Math.round(grams)} g`);
  if (!OZ_FAMILY.has(key) && grams >= MIN_GRAMS_FOR_OZ)
    alts.push(`${round(grams / 28.3495, 1)} oz`);
  if (!LB_FAMILY.has(key) && grams >= 453.592) alts.push(`${round(grams / 453.592, 2)} lb`);
  if (!alts.length) return line;

  const end = m[0].length;
  return `${line.slice(0, end)} (${alts.join(" · ")})${line.slice(end)}`;
}

/** Annotate each line of a free-text ingredient list with imperial/metric equivalents. */
export function addWeightConversions(text: string): string {
  return text.split("\n").map(annotateLine).join("\n");
}
