/**
 * USDA FoodData Central client.
 *
 * This is the nutrition oracle. Previously an LLM was asked to *recall* macros
 * from memory; now they come from measured data. The model's only job is to say
 * WHICH food and HOW MUCH — see `lib/nutrition/parse.ts`.
 *
 * Two things here are load-bearing and non-obvious:
 *
 * 1. **Never trust the top search hit.** Searching "chicken breast, cooked"
 *    returns "Chicken breast tenders, breaded, cooked, microwaved" as the first
 *    result — 252 kcal / 17.6g carbs, versus ~165 kcal / 0g carbs for plain
 *    chicken breast. Silently taking `foods[0]` logs breaded tenders as grilled
 *    chicken. We return candidates and let the caller choose.
 *
 * 2. **Never let the model guess grams.** USDA ships measured portion weights
 *    (`1 large egg = 50g`, `1 cup cooked = 158g`). The local model estimated a
 *    large egg at 105g and a cup of rice at 284g — both ~2x heavy. `gramsFor()`
 *    resolves qty+unit against real portion data instead.
 */

const FDC_BASE = "https://api.nal.usda.gov/fdc/v1";

/**
 * FDC `nutrientNumber` → our field.
 *
 * Energy is the trap. `208` is the classic "Energy (kcal)" code, but many
 * Foundation foods report energy ONLY under the Atwater specific/general factor
 * codes (`957`/`958`) and omit 208 entirely. Mapping just 208 yields **0 kcal**
 * for foods like raw chicken breast and peanut butter — with protein and fat
 * populated, so it looks plausible rather than broken. Accept all three, and if
 * energy is still missing, derive it from the macros (see `deriveEnergy`).
 */
const NUTRIENT_MAP: Record<string, keyof Macros> = {
  "203": "protein_g",
  "205": "carbs_g",
  "204": "fat_g",
  "291": "fiber_g",
  "269": "sugar_g",
  "307": "sodium_mg",
};

/** Energy codes, in preference order. 208 = Energy (kcal); 957/958 = Atwater factors. */
const ENERGY_CODES = ["208", "958", "957"];

/** 4/4/9 — the Atwater factors. Only used when USDA reports no energy at all. */
function deriveEnergy(m: Macros): number {
  return m.protein_g * 4 + m.carbs_g * 4 + m.fat_g * 9;
}

export type Macros = {
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g: number;
  sugar_g: number;
  sodium_mg: number;
};

export type FdcCandidate = {
  fdcId: number;
  description: string;
  dataType: string;
};

export type FdcFood = {
  fdcId: number;
  description: string;
  /** Per 100g — FDC's canonical basis for Foundation/SR Legacy. */
  per100g: Macros;
  portions: FdcPortion[];
};

export type FdcPortion = {
  /** e.g. 1 */
  amount: number;
  /** e.g. "cup", "large", "tbsp" */
  unit: string;
  /** e.g. "cooked" */
  modifier: string;
  gramWeight: number;
};

function apiKey(): string {
  const k = process.env.FDC_API_KEY;
  if (!k) throw new Error("FDC_API_KEY is not set");
  return k;
}

const ZERO: Macros = {
  calories: 0,
  protein_g: 0,
  carbs_g: 0,
  fat_g: 0,
  fiber_g: 0,
  sugar_g: 0,
  sodium_mg: 0,
};

/**
 * Search for candidate foods.
 *
 * Restricted to Foundation + SR Legacy: these are USDA's *measured* datasets.
 * "Branded" is a manufacturer-submitted free-for-all and would flood results
 * with packaged products when the user says "chicken breast".
 */
export async function searchFoods(query: string, limit = 5): Promise<FdcCandidate[]> {
  const url =
    `${FDC_BASE}/foods/search?` +
    new URLSearchParams({
      query,
      api_key: apiKey(),
      pageSize: String(limit),
      dataType: "Foundation,SR Legacy",
    });

  const res = await fetch(url, { next: { revalidate: 86400 } }); // food data is static; cache a day
  if (!res.ok) throw new Error(`FDC search failed (${res.status})`);
  const json = (await res.json()) as {
    foods?: { fdcId: number; description: string; dataType: string }[];
  };

  const candidates = (json.foods ?? []).map((f) => ({
    fdcId: f.fdcId,
    description: f.description,
    dataType: f.dataType,
  }));

  return rankCandidates(query, candidates);
}

/**
 * Markers of a PROCESSED variant. USDA search happily returns deli meat and
 * breaded product for a plain-food query:
 *   "chicken breast, cooked"  -> "Chicken breast tenders, breaded, cooked, microwaved"
 *   "chicken breast, roasted" -> "Chicken breast, oven-roasted, fat-free, sliced"
 * Both are wildly off (breaded: +50% kcal and 17g carbs; deli: half the calories).
 * Demote them unless the user actually asked for that form.
 */
const PROCESSED_MARKERS = [
  "breaded",
  "battered",
  "fried",
  "nugget",
  "tender",
  "patty",
  "canned",
  "luncheon",
  "deli",
  "sliced",
  "fat-free",
  "low-fat",
  "reduced",
  "smoked",
  "cured",
  "prepared",
  "microwaved",
  "restaurant",
  "baby food",
  "infant",
];

/**
 * Sort candidates so plain forms come first. The model still makes the final
 * pick (`pickBestFood`), but it picks from a list that isn't already poisoned —
 * ranking and selection are cheap insurance against each other.
 */
function rankCandidates<T extends { description: string; dataType: string }>(
  query: string,
  candidates: T[],
): T[] {
  const q = query.toLowerCase();

  const score = (c: T): number => {
    const d = c.description.toLowerCase();
    let s = 0;

    // Penalise processed markers the user did NOT ask for.
    for (const m of PROCESSED_MARKERS) {
      if (d.includes(m) && !q.includes(m)) s += 10;
    }
    // Foundation is measured lab data; SR Legacy is older/derived. Mild preference.
    if (c.dataType !== "Foundation") s += 1;
    // Prefer concise entries — long descriptions are usually oddly-specific products.
    s += d.length / 200;

    return s;
  };

  return [...candidates].sort((a, b) => score(a) - score(b));
}

/** Full record for one food: per-100g macros + its measured portion weights. */
export async function getFood(fdcId: number): Promise<FdcFood> {
  const url = `${FDC_BASE}/food/${fdcId}?` + new URLSearchParams({ api_key: apiKey() });
  const res = await fetch(url, { next: { revalidate: 86400 } });
  if (!res.ok) throw new Error(`FDC food ${fdcId} failed (${res.status})`);

  const json = (await res.json()) as {
    fdcId: number;
    description: string;
    foodNutrients?: { nutrient?: { number?: string; unitName?: string }; amount?: number }[];
    foodPortions?: {
      amount?: number;
      modifier?: string;
      gramWeight?: number;
      measureUnit?: { name?: string };
    }[];
  };

  const per100g: Macros = { ...ZERO };
  const energyByCode: Record<string, number> = {};

  for (const n of json.foodNutrients ?? []) {
    const code = String(n.nutrient?.number);
    if (typeof n.amount !== "number") continue;

    const key = NUTRIENT_MAP[code];
    if (key) per100g[key] = n.amount;

    // Energy is reported under several codes, and some foods only carry the
    // Atwater ones. Collect whatever is present, then pick in preference order.
    if (ENERGY_CODES.includes(code) && (n.nutrient?.unitName ?? "kcal").toLowerCase() !== "kj") {
      energyByCode[code] = n.amount;
    }
  }

  const energyCode = ENERGY_CODES.find((c) => energyByCode[c] != null);
  per100g.calories = energyCode
    ? energyByCode[energyCode]
    : // No energy reported at all -> compute it from the macros rather than log 0 kcal.
      deriveEnergy(per100g);

  const portions: FdcPortion[] = (json.foodPortions ?? [])
    .filter((p) => typeof p.gramWeight === "number" && p.gramWeight > 0)
    .map((p) => ({
      amount: p.amount ?? 1,
      unit: (p.measureUnit?.name ?? "").toLowerCase(),
      modifier: (p.modifier ?? "").toLowerCase(),
      gramWeight: p.gramWeight as number,
    }));

  return { fdcId: json.fdcId, description: json.description, per100g, portions };
}

/** Direct weight/volume units we can convert without any USDA portion data. */
const DIRECT_GRAMS: Record<string, number> = {
  g: 1,
  gram: 1,
  grams: 1,
  kg: 1000,
  oz: 28.3495,
  ounce: 28.3495,
  ounces: 28.3495,
  lb: 453.592,
  pound: 453.592,
};

/**
 * Units that carry no real information — the model fell back to these because the
 * user didn't state a measurement. When USDA has portion data for the food, its
 * measured portion is a far better answer than our fallback table.
 */
const GENERIC_UNITS = new Set([
  "serving",
  "each",
  "item",
  "piece",
  "medium",
  "large",
  "small",
  "bowl",
  "plate",
  "portion",
  "",
]);

/**
 * Last-resort weights when USDA has no portion for the stated unit.
 *
 * The garnish units are not padding: "2 leaf" of basil had no USDA portion, fell
 * through to the 100g/serving default, and logged **200g of basil** — a shrub, not
 * a garnish. A leaf is not a serving.
 */
const FALLBACK_GRAMS: Record<string, number> = {
  cup: 150,
  tablespoon: 15,
  tbsp: 15,
  teaspoon: 5,
  tsp: 5,
  slice: 30,
  serving: 100,
  medium: 120,
  large: 140,
  small: 90,
  each: 100,
  item: 100,
  piece: 100,
  bowl: 250,
  // Garnishes / aromatics — grams, not hectograms.
  leaf: 0.5,
  leaves: 0.5,
  sprig: 1,
  clove: 3,
  pinch: 0.5,
  dash: 0.5,
  drizzle: 5,
  handful: 30,
};

/**
 * Measure words. A portion naming one of these is quoting THAT measure — so a
 * portion described as "cup (4.86 large eggs)" is a CUP, not a "large".
 */
const MEASURE_WORDS = [
  "cup",
  "tablespoon",
  "tbsp",
  "teaspoon",
  "tsp",
  "quart",
  "pint",
  "gallon",
  "liter",
  "ml",
  "fl oz",
  "oz",
  "lb",
  "gram",
  "g",
];

/**
 * The human-readable descriptor of a portion. USDA often sets measureUnit.name to
 * the literal string "undetermined" and puts the real description in `modifier`
 * (e.g. modifier="large", or modifier="cup (4.86 large eggs)").
 */
function descriptorOf(p: FdcPortion): string {
  const u = p.unit && p.unit !== "undetermined" ? p.unit : "";
  return (u || p.modifier || "").toLowerCase().trim();
}

/**
 * True if `wanted` (the user's unit) genuinely matches `descriptor`.
 *
 * Requires a word-boundary hit, and rejects descriptors that name a *different*
 * measure — which is what stops "large" from matching "cup (4.86 large eggs)".
 */
function unitMatches(wanted: string, descriptor: string): boolean {
  if (!wanted || !descriptor) return false;
  if (!new RegExp(`\\b${wanted.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(descriptor)) {
    return false;
  }
  // Descriptor mentions a measure the user did NOT ask for -> not a match.
  const foreign = MEASURE_WORDS.some(
    (m) => m !== wanted && new RegExp(`\\b${m}\\b`).test(descriptor),
  );
  return !foreign;
}

/**
 * Resolve qty + unit → grams, preferring USDA's measured portion weights.
 *
 * Order matters:
 *   1. An explicit weight ("6 oz", "150 g") is the user's own measurement — it
 *      always wins. No lookup can beat a stated number.
 *   2. A USDA portion matching the unit ("1 large" → 50g for an egg).
 *   3. A coarse fallback table, flagged `exact: false` so the caller can surface
 *      lower confidence rather than pretending precision it doesn't have.
 */
export function gramsFor(
  qty: number,
  unit: string,
  portions: FdcPortion[],
): { grams: number; exact: boolean; basis: string } {
  const u = (unit || "").toLowerCase().trim();
  const n = qty > 0 ? qty : 1;

  // 1. A stated weight/volume is the user's own measurement. Nothing beats it.
  const direct = DIRECT_GRAMS[u];
  if (direct) return { grams: n * direct, exact: true, basis: `${n} ${u}` };

  const describe = (p: FdcPortion) =>
    `USDA portion: ${p.amount} ${descriptorOf(p)} = ${p.gramWeight}g`;

  // 2. A USDA portion matching the stated unit.
  //
  //    Substring matching here is a trap. USDA's egg portions include
  //    "1 cup (4.86 large eggs) = 243g". Naively searching the modifier for "large"
  //    matches THAT row, so `2 large` eggs resolved to 2 x 243g = 486g / 695 kcal.
  //    Match on a word boundary against the portion's real descriptor, and reject
  //    any portion that names a DIFFERENT measure than the one asked for.
  const usable = portions.filter((p) => p.amount > 0);
  const match =
    usable.find((p) => descriptorOf(p) === u) ??
    usable.find((p) => unitMatches(u, descriptorOf(p)));

  if (match) {
    return { grams: n * (match.gramWeight / match.amount), exact: true, basis: describe(match) };
  }

  // 3. Generic unit ("serving", "each", "medium"...) but USDA DOES have portion
  //    data: use its first measured portion rather than a flat guess.
  //
  //    This is what stops the 2x egg error: the model says `2 serving` of egg,
  //    and a flat 100g/serving gives 200g — but USDA knows a large egg is 50g,
  //    so 2 eggs is ~100g. Real portion data beats our fallback table every time.
  if (GENERIC_UNITS.has(u) && usable.length > 0) {
    // Prefer a countable portion ("1 large" = 50g) over a bulk/volume one
    // ("1 cup (4.86 large eggs)" = 243g) — the latter is not what "a serving" means.
    const countable =
      usable.find((p) => !MEASURE_WORDS.some((m) => new RegExp(`\\b${m}\\b`).test(descriptorOf(p)))) ??
      usable[0];
    return {
      grams: n * (countable.gramWeight / countable.amount),
      exact: true,
      basis: `${describe(countable)} (assumed for "${u || "serving"}")`,
    };
  }

  // 4. Nothing measured to lean on — flag it so the caller reports lower confidence.
  const fb = FALLBACK_GRAMS[u] ?? FALLBACK_GRAMS.serving;
  return { grams: n * fb, exact: false, basis: `assumed ${fb}g per ${u || "serving"}` };
}

/** Scale per-100g macros to an actual gram weight. */
export function macrosForGrams(per100g: Macros, grams: number): Macros {
  const f = grams / 100;
  return {
    calories: per100g.calories * f,
    protein_g: per100g.protein_g * f,
    carbs_g: per100g.carbs_g * f,
    fat_g: per100g.fat_g * f,
    fiber_g: per100g.fiber_g * f,
    sugar_g: per100g.sugar_g * f,
    sodium_mg: per100g.sodium_mg * f,
  };
}

export function addMacros(a: Macros, b: Macros): Macros {
  return {
    calories: a.calories + b.calories,
    protein_g: a.protein_g + b.protein_g,
    carbs_g: a.carbs_g + b.carbs_g,
    fat_g: a.fat_g + b.fat_g,
    fiber_g: a.fiber_g + b.fiber_g,
    sugar_g: a.sugar_g + b.sugar_g,
    sodium_mg: a.sodium_mg + b.sodium_mg,
  };
}

export function roundMacros(m: Macros): Macros {
  return {
    calories: Math.round(m.calories),
    protein_g: Math.round(m.protein_g * 10) / 10,
    carbs_g: Math.round(m.carbs_g * 10) / 10,
    fat_g: Math.round(m.fat_g * 10) / 10,
    fiber_g: Math.round(m.fiber_g * 10) / 10,
    sugar_g: Math.round(m.sugar_g * 10) / 10,
    sodium_mg: Math.round(m.sodium_mg),
  };
}

export const EMPTY_MACROS = ZERO;
