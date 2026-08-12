import type { RecipeIngredient } from "./types";

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
// 1.25 lb of chicken but the recipe says 200 g"). `annotateLine` annotates each weight with its
// other units, leaving the stored text unchanged. Reached via `parseIngredients` below.

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

// ── Rice: grams ↔ go ────────────────────────────────────────────────────────────
// Jason scoops rice in *go* (合), the Japanese rice cup — 1 go = 150 g of DRY rice. Recipes are
// written in grams because USDA is, and a cooked-weight line hides the number he actually measures
// at the bag. Annotating at render time rather than in the stored text means every rice line gets
// it, including rows written by a future script that forgets the convention.
const GRAMS_PER_GO = 150;

// Cooked yield differs by grain, so a cooked line is only convertible when it says which it is.
const COOKED_YIELD: Record<string, number> = { white: 3.0, brown: 2.75 };

const RICE_DRY = /(\d+(?:\.\d+)?)\s*g\s+dry\s+(?:\w+\s+)?rice\b/i;
const RICE_COOKED = /(\d+(?:\.\d+)?)\s*g\s+cooked\s+(white|brown)\s+rice\b/i;

function annotateRice(line: string): string {
  if (/\bgo\b/i.test(line)) return line; // already carries its go — don't double-annotate

  const dry = line.match(RICE_DRY);
  if (dry) return `${line} (${round(parseFloat(dry[1]) / GRAMS_PER_GO, 2)} go)`;

  const cooked = line.match(RICE_COOKED);
  if (cooked) {
    // Derive the go from the ROUNDED dry weight, not the raw one: both numbers are shown side by
    // side, and a reader who divides the printed grams by 150 has to land on the printed go.
    const dryGrams = Math.round(parseFloat(cooked[1]) / COOKED_YIELD[cooked[2].toLowerCase()]);
    return `${line} (~${dryGrams} g dry = ${round(dryGrams / GRAMS_PER_GO, 2)} go)`;
  }
  return line;
}

// ── Ingredient lists ────────────────────────────────────────────────────────────
// `recipes.ingredients` is a free-text column holding one ingredient per line. A batch script in
// August 2026 wrote eight rows as a JSON-encoded array *into* that text column, so the UI rendered
// the literal `["Chicken breast - 255 g", ...]` — the page was faithfully printing what was stored.
// The rows were repaired, but parsing the array back out here means the next bad write degrades to
// a correct list instead of leaking syntax at Jason.

/**
 * Split a stored ingredient list into raw lines — no annotation.
 *
 * Separate from `parseIngredients` because the structured-recipe editor seeds its rows from this
 * and must see the text the author actually wrote. Annotated text would feed "200 g (7.1 oz) beef"
 * back into the amount lexer, which then has two numbers to choose between.
 */
export function splitIngredientLines(text: string | null | undefined): string[] {
  const trimmed = (text ?? "").trim();
  if (!trimmed) return [];

  let lines: string[];
  if (trimmed.startsWith("[")) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      parsed = null; // not valid JSON after all — fall back to line splitting
    }
    lines =
      Array.isArray(parsed) && parsed.every((x) => typeof x === "string")
        ? (parsed as string[])
        : trimmed.split("\n");
  } else {
    lines = trimmed.split("\n");
  }
  return lines.map((l) => l.trim()).filter(Boolean);
}

/** Split a stored ingredient list into display lines, annotated with unit and go conversions. */
export function parseIngredients(text: string | null | undefined): string[] {
  // Rice first: `annotateLine` splices "(2.8 oz)" in between the number and the word that follows
  // it, which would break the "<n> g dry rice" match. Going rice-first also parks the go at the end
  // of the line, where it reads as a note rather than interrupting the amount.
  return splitIngredientLines(text).map((l) => annotateLine(annotateRice(l)));
}

// ── Structured ingredients ──────────────────────────────────────────────────────
// `ingredients_json` stores the amount as data instead of prose. Rendering still goes through the
// same annotators, so a structured row picks up the imperial and rice-go conversions for free and
// the two storage shapes cannot drift into looking different on screen.

/** Trim trailing zeros so 150 renders "150", not "150.00", while 1.5 survives. */
function amountText(quantity: number, unit: string | null | undefined): string {
  const n = round(quantity, 2);
  return unit ? `${n} ${unit}` : `${n}`;
}

/**
 * One structured ingredient as a display line: "454 g (16 oz) ground beef, 93/7, browned".
 *
 * Quantity and unit lead, because `annotateLine` only matches a weight at the START of a line —
 * the same reason the legacy text convention put the amount first. `optional` and `note` are
 * appended AFTER annotation: a note is free text and could contain a bare "go", which would make
 * `annotateRice` treat the line as already carrying its go and skip the conversion.
 */
export function formatIngredient(ing: RecipeIngredient): string {
  const head =
    ing.quantity == null ? ing.item : `${amountText(ing.quantity, ing.unit)} ${ing.item}`;
  const annotated = annotateLine(annotateRice(ing.prep ? `${head}, ${ing.prep}` : head));

  let line = annotated;
  if (ing.optional) line += " (optional)";
  if (ing.note) line += ` — ${ing.note}`;
  return line;
}

/**
 * Ingredients bucketed by `group`, preserving first-seen order for both the groups and the rows
 * inside them. Ungrouped rows collect under a null key, which the renderer prints without a
 * heading — so a flat list stays flat rather than growing a spurious "Other" section.
 */
export function groupIngredients(
  items: RecipeIngredient[],
): { group: string | null; items: RecipeIngredient[] }[] {
  const out: { group: string | null; items: RecipeIngredient[] }[] = [];
  for (const ing of items) {
    const key = ing.group?.trim() || null;
    const bucket = out.find((b) => b.group === key);
    if (bucket) bucket.items.push(ing);
    else out.push({ group: key, items: [ing] });
  }
  return out;
}
