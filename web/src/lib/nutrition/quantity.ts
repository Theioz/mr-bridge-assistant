/**
 * Quantities are TEXT, not inference.
 *
 * The pipeline's stated invariant is "the model never produces a macro number — USDA does".
 * That was never enough, because the model still produced the two inputs that DETERMINE the
 * macros: the food's identity and its quantity. Measured on qwen2.5vl:7b against a real
 * recipe:
 *
 *   input:  "3 lb chicken breast, 2 cups dry brown rice, green beans, olive oil"
 *   emits:  chicken breast, ROASTED      (the text said raw)
 *           rice, brown, COOKED          (the text said DRY — a 3x carb error)
 *           green bean, 1 SERVING        (no quantity was stated; it invented one)
 *           olive oil                    (dropped entirely)
 *
 * The rice resolved to 90g of carbs instead of ~280g and was reported as HIGH confidence.
 *
 * "3 lb" and "2 cups" are literally written down. Reading them is a lexer's job, not a
 * language model's. This module extracts a quantity from the user's own words so the model
 * never has to repeat a number — because when it repeats one, it sometimes changes it.
 *
 * When no quantity is stated, that is reported as UNQUANTIFIED rather than papered over with
 * an invented serving. An unquantified ingredient is a question for the user, not a guess.
 */

export interface LexedQuantity {
  qty: number;
  unit: string;
  /** The literal text this came from, for the audit trail. */
  source: string;
}

// Unicode fractions people actually type, plus the ascii ones.
const VULGAR: Record<string, number> = {
  "¼": 0.25,
  "½": 0.5,
  "¾": 0.75,
  "⅓": 1 / 3,
  "⅔": 2 / 3,
  "⅛": 0.125,
};

// Units we can act on. Anything else (a bare "handful") is not a measurement we can
// resolve, and is treated as unquantified rather than coerced into one.
//
// Mass/volume units pass straight through to fdc.ts's DIRECT_GRAMS or USDA portion tables.
// Countable and produce/container units ("large", "slice", "bunch") are resolved against
// USDA's own portion data.
const UNIT_ALIASES: Record<string, string> = {
  g: "g",
  gram: "g",
  grams: "g",
  gr: "g",
  kg: "kg",
  kilogram: "kg",
  kilograms: "kg",
  oz: "oz",
  ounce: "oz",
  ounces: "oz",
  lb: "lb",
  lbs: "lb",
  pound: "lb",
  pounds: "lb",
  cup: "cup",
  cups: "cup",
  tbsp: "tbsp",
  tablespoon: "tbsp",
  tablespoons: "tbsp",
  tsp: "tsp",
  teaspoon: "tsp",
  teaspoons: "tsp",
  ml: "ml",
  milliliter: "ml",
  milliliters: "ml",
  l: "l",
  liter: "l",
  liters: "l",
  clove: "clove",
  cloves: "clove",
  slice: "slice",
  slices: "slice",
  large: "large",
  medium: "medium",
  small: "small",
  each: "each",
  can: "can",
  cans: "can",
  fillet: "fillet",
  fillets: "fillet",
  breast: "breast",
  breasts: "breast",
  thigh: "thigh",
  thighs: "thigh",
  drumstick: "drumstick",
  drumsticks: "drumstick",
  wing: "wing",
  wings: "wing",

  // Produce and container units USDA models as real portions ("1 bunch spinach = 340g",
  // "1 package (10 oz) = 284g"). These belong here for the same reason "large" does: they
  // are USDA portion descriptors gramsFor resolves against measured data, NOT bare counts.
  // Without them, "1/2 bunch spinach" fell through to the bare-count branch and became
  // qty 0.5 unit "each" — silently resolved against whatever spinach portion USDA returned
  // first, so a recipe backfilled with "bunch" or "package" carried a wrong number wearing a
  // confident badge. Where USDA has no portion for the unit, gramsFor still flags it inexact.
  bunch: "bunch",
  bunches: "bunch",
  package: "package",
  packages: "package",
  pkg: "package",
  bag: "bag",
  bags: "bag",
  head: "head",
  heads: "head",
  stalk: "stalk",
  stalks: "stalk",
  sprig: "sprig",
  sprigs: "sprig",
};

// number: "2", "2.5", "1/2", "1 1/2", "½", "1½"
const NUMBER = String.raw`(\d+\s+\d+\/\d+|\d+\/\d+|\d*[¼½¾⅓⅔⅛]|\d+(?:\.\d+)?)`;
const UNIT = String.raw`([a-zA-Z]+)`;

const QTY_WITH_UNIT = new RegExp(String.raw`^\s*${NUMBER}\s*${UNIT}\b`, "u");
const QTY_BARE = new RegExp(String.raw`^\s*${NUMBER}\s+`, "u");

function parseNumber(raw: string): number | null {
  const t = raw.trim();

  // "1 1/2"
  const mixed = /^(\d+)\s+(\d+)\/(\d+)$/.exec(t);
  if (mixed) return Number(mixed[1]) + Number(mixed[2]) / Number(mixed[3]);

  // "1/2"
  const frac = /^(\d+)\/(\d+)$/.exec(t);
  if (frac) return Number(frac[1]) / Number(frac[2]);

  // "1½" / "½"
  const vulgar = /^(\d*)([¼½¾⅓⅔⅛])$/u.exec(t);
  if (vulgar) return (vulgar[1] ? Number(vulgar[1]) : 0) + VULGAR[vulgar[2]];

  const n = Number(t);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Read a quantity off the front of an ingredient line.
 *
 * Returns null when the text states no quantity ("Green beans, olive oil + lemon") — that is
 * a real answer, not a failure. The caller must NOT substitute a serving; it must say so.
 *
 *   "3 lb chicken breast"      -> { qty: 3,   unit: "lb"  }
 *   "2 cups dry brown rice"    -> { qty: 2,   unit: "cup" }
 *   "1/2 cup oats"             -> { qty: 0.5, unit: "cup" }
 *   "12 drumsticks"            -> { qty: 12,  unit: "drumstick" }
 *   "Green beans"              -> null
 *   "a handful of spinach"     -> null   (not a measurement we can resolve)
 */
export function lexQuantity(text: string): LexedQuantity | null {
  const t = text.trim();
  if (!t) return null;

  const withUnit = QTY_WITH_UNIT.exec(t);
  if (withUnit) {
    const qty = parseNumber(withUnit[1]);
    const unit = UNIT_ALIASES[withUnit[2].toLowerCase()];
    // A recognised number followed by a word we don't know as a unit is usually the food
    // itself ("2 eggs", "3 bananas") — a bare count. Fall through to the bare-count branch.
    if (qty !== null && unit) {
      return { qty, unit, source: withUnit[0].trim() };
    }
  }

  // A bare leading count: "2 eggs", "12 drumsticks". The unit is the food's own natural one,
  // which USDA's portion table resolves ("1 large egg = 50g"). "each" is the honest label:
  // we know HOW MANY, and we are not pretending to know how much each weighs.
  const bare = QTY_BARE.exec(t);
  if (bare) {
    const qty = parseNumber(bare[1]);
    if (qty !== null) return { qty, unit: "each", source: bare[1].trim() };
  }

  return null;
}

/**
 * Split a recipe's ingredient text into individual ingredient fragments.
 *
 * Recipes are written as lines and comma-separated lists, and both matter:
 *
 *   "3 lb chicken breast, 2 cups dry brown rice
 *    Green beans, olive oil + lemon"
 *
 * Splitting on "+" too would break "olive oil + lemon" into two, which is correct — they
 * are two ingredients.
 */
export function splitIngredients(text: string): string[] {
  return text
    .split(/[\n,+]/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}
