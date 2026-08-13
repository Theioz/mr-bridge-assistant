import type { RecipeIngredient, RecipeStep } from "../types";

/**
 * Validation for the structured recipe columns.
 *
 * The database checks only that `ingredients_json` is a JSON *array*; nothing constrains its
 * elements. That is deliberate — Postgres is the wrong place to encode a shape this fiddly — but it
 * means the API is the last line of defence, and this value feeds the macro pipeline. A row that
 * reaches USDA with `quantity: "200g"` (a string) resolves to nothing and silently drops a real
 * ingredient out of a real total, which is precisely the failure mode #665 and the macro-audit work
 * were about.
 *
 * So: reject, don't coerce. A malformed payload is a bug in the caller, and quietly repairing it
 * would hide that bug and store something the author never wrote.
 */

export class RecipeShapeError extends Error {}

function fail(path: string, why: string): never {
  throw new RecipeShapeError(`${path}: ${why}`);
}

function optionalString(v: unknown, path: string): string | null {
  if (v == null) return null;
  if (typeof v !== "string") fail(path, "must be a string or null");
  const t = v.trim();
  return t.length ? t : null;
}

/**
 * Normalize one ingredient row.
 *
 * `quantity: null` is explicitly VALID and is not the same as a missing amount — "salt, to taste"
 * is an author stating there is no mass. The resolver excludes such rows from the total without
 * capping confidence, so the distinction has to survive validation rather than be normalized away.
 */
export function parseIngredientRow(raw: unknown, path: string): RecipeIngredient {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) fail(path, "must be an object");
  const r = raw as Record<string, unknown>;

  const item = typeof r.item === "string" ? r.item.trim() : "";
  if (!item) fail(`${path}.item`, "is required and must be a non-empty string");

  let quantity: number | null = null;
  if (r.quantity != null) {
    if (typeof r.quantity !== "number" || !Number.isFinite(r.quantity))
      fail(`${path}.quantity`, "must be a finite number or null");
    if (r.quantity < 0) fail(`${path}.quantity`, "must not be negative");
    quantity = r.quantity;
  }

  const unit = optionalString(r.unit, `${path}.unit`);
  // A bare number with no unit cannot be converted to grams, so USDA would fall back to an assumed
  // portion — an amount that looks stated but isn't. Catch it at write time.
  if (quantity != null && !unit) fail(`${path}.unit`, "is required when quantity is set");

  let fdcId: number | null = null;
  if (r.fdc_id != null) {
    if (typeof r.fdc_id !== "number" || !Number.isInteger(r.fdc_id) || r.fdc_id <= 0)
      fail(`${path}.fdc_id`, "must be a positive integer USDA FoodData Central id");
    fdcId = r.fdc_id;
  }

  if (r.optional != null && typeof r.optional !== "boolean")
    fail(`${path}.optional`, "must be a boolean");

  return {
    item,
    quantity,
    unit,
    prep: optionalString(r.prep, `${path}.prep`),
    group: optionalString(r.group, `${path}.group`),
    optional: r.optional === true ? true : undefined,
    note: optionalString(r.note, `${path}.note`),
    fdc_id: fdcId,
  };
}

/**
 * Foods normally measured by spoon, and the USDA gram weight of that spoon.
 *
 * Nobody weighs 16 g of soy sauce — you tare a bowl, dribble, and swear — and for viscous things the
 * residue left on the spoon is a real fraction of the amount. Volume-first was asked for on
 * 2026-07-31 and confirmed as a standing rule for all future recipes.
 *
 * Weights come from each food's USDA `foodPortions`, NOT a hand-kept table: since ingredients became
 * structured, a spoon quantity is *resolved* by `gramsFor` against the pinned record, so the grams
 * printed in the recipe and the grams the macro path uses have to be the same number. (The
 * hand-kept table had avocado oil at 1 tsp = 5 g; USDA says 4.5.)
 */
const SPOON_CLASS: { match: RegExp; tsp?: number; tbsp: number }[] = [
  { match: /\b(avocado|olive|sesame|cooking|vegetable) oil\b/i, tsp: 4.5, tbsp: 14 },
  { match: /\btomato paste\b/i, tbsp: 16 },
  { match: /\b(soy sauce|shoyu|tamari)\b/i, tbsp: 16 },
  { match: /\bpeanut butter\b/i, tbsp: 16 },
  { match: /\b(ground )?flaxseed\b/i, tbsp: 7 },
];

/**
 * Looks spoon-class, but has NO USDA record — so no portion table exists to resolve a volume
 * against. Grams are label-derived and must stay the quantity: writing `1 tbsp` would leave a
 * re-resolve with no way back to grams, which is the silent-drop failure this pipeline has already
 * been bitten by. These carry the spoon in the item label instead — `gochujang (1 tbsp)`.
 */
const NO_USDA_PORTION = /\bgochujang\b/i;

export interface SpoonViolation {
  item: string;
  grams: number;
  suggestion: string;
}

/**
 * Spoon-class ingredients that were given a bare gram quantity.
 *
 * WHY THIS IS ENFORCED RATHER THAN DOCUMENTED. The rule has drifted twice. It was applied by hand
 * across 25 recipes on 2026-07-31, and every recipe authored afterwards ignored it — by 2026-08-13,
 * 16 lines across 13 recipes had reverted to bare grams, including all four on that week's meal
 * plan (`13 g tomato paste`, `4 g avocado oil`). A convention that lives only in prose gets
 * re-broken by whoever writes the next recipe.
 */
export function spoonViolations(rows: RecipeIngredient[] | null): SpoonViolation[] {
  if (!rows) return [];
  const out: SpoonViolation[] = [];
  for (const r of rows) {
    const q = r.quantity;
    if (r.unit !== "g" || typeof q !== "number" || !Number.isFinite(q) || q <= 0) continue;
    if (NO_USDA_PORTION.test(r.item)) continue;
    const spec = SPOON_CLASS.find((s) => s.match.test(r.item));
    if (!spec) continue;

    // Suggest the nearest REAL spoon rather than an exact division: 1.78 tsp is not a measurement.
    // Rounding to a spoon is the point — a gram or two of oil is noise against a meal, an
    // unmeasurable number is not.
    const options: [number, string, number][] = [
      ...(spec.tsp
        ? ([
            [1, "tsp", spec.tsp],
            [2, "tsp", spec.tsp * 2],
          ] as [number, string, number][])
        : []),
      [1, "tbsp", spec.tbsp],
      [1.5, "tbsp", spec.tbsp * 1.5],
      [2, "tbsp", spec.tbsp * 2],
      [3, "tbsp", spec.tbsp * 3],
    ];
    const best = options.reduce((a, b) => (Math.abs(b[2] - q) < Math.abs(a[2] - q) ? b : a));
    out.push({ item: r.item, grams: q, suggestion: `${best[0]} ${best[1]} (${best[2]} g)` });
  }
  return out;
}

export function parseIngredientRows(raw: unknown): RecipeIngredient[] | null {
  if (raw == null) return null;
  if (!Array.isArray(raw)) throw new RecipeShapeError("ingredients_json: must be an array");
  const rows = raw.map((r, i) => parseIngredientRow(r, `ingredients_json[${i}]`));

  const bad = spoonViolations(rows);
  if (bad.length) {
    throw new RecipeShapeError(
      "ingredients_json: these are measured by spoon, not weighed — give a volume and keep the " +
        "grams in the item label. " +
        bad.map((b) => `"${b.item}" ${b.grams} g -> ${b.suggestion}`).join("; "),
    );
  }
  return rows;
}

export function parseStepRow(raw: unknown, path: string, fallbackStep: number): RecipeStep {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) fail(path, "must be an object");
  const r = raw as Record<string, unknown>;

  const text = typeof r.text === "string" ? r.text.trim() : "";
  if (!text) fail(`${path}.text`, "is required and must be a non-empty string");

  // Step numbers are authoritative for render order, but authoring UIs routinely omit them and
  // rely on array position. Defaulting to position is safe; a NON-INTEGER step is not.
  let step = fallbackStep;
  if (r.step != null) {
    if (typeof r.step !== "number" || !Number.isInteger(r.step) || r.step < 1)
      fail(`${path}.step`, "must be a positive integer");
    step = r.step;
  }

  let tips: string[] | null = null;
  if (r.tips != null) {
    if (!Array.isArray(r.tips) || r.tips.some((t) => typeof t !== "string"))
      fail(`${path}.tips`, "must be an array of strings");
    const cleaned = (r.tips as string[]).map((t) => t.trim()).filter(Boolean);
    tips = cleaned.length ? cleaned : null;
  }

  let duration: number | null = null;
  if (r.duration_mins != null) {
    if (
      typeof r.duration_mins !== "number" ||
      !Number.isFinite(r.duration_mins) ||
      r.duration_mins < 0
    )
      fail(`${path}.duration_mins`, "must be a non-negative number");
    duration = r.duration_mins;
  }

  return { step, text, tips, duration_mins: duration };
}

export function parseStepRows(raw: unknown): RecipeStep[] | null {
  if (raw == null) return null;
  if (!Array.isArray(raw)) throw new RecipeShapeError("steps_json: must be an array");
  return raw.map((r, i) => parseStepRow(r, `steps_json[${i}]`, i + 1));
}
