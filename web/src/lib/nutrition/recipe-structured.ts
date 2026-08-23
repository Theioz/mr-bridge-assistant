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
 * Looks spoon-class, but cannot resolve a VOLUME against a USDA portion table — so grams must stay
 * the quantity and the spoon goes in the item label instead: `gochujang (1 tbsp)`.
 *
 * A branded record DOES exist (FDC 2113732, SUNCHANG — 200 kcal / 5P / 45C / 5 fib per 100 g, and
 * its serving size of 20 g = 1 Tbsp is where that conversion comes from). But `isPlausibleMatch`
 * rejects branded records outright, so the resolver still cannot reach it and writing `1 tbsp` as
 * the quantity would leave a re-resolve with no way back to grams. Hand-pin 2113732 as the basis.
 *
 * Do NOT proxy gochujang with sriracha. On 2026-08-23 two rows did exactly that (FDC 171188, 79
 * kcal/100 g) — a 2.5x understatement — and a third cited 171141, which is condensed black bean
 * soup. Across the library the same ingredient was priced at 93, 190, 210 and 230 kcal/100 g.
 */
const NO_USDA_PORTION = /\bgochujang\b/i;

/** A spoon measure written into the item label: `gochujang (1 tbsp)`, `gochujang (2.2 tsp)`. */
const SPOON_IN_LABEL = /\b\d+(?:\.\d+)?\s*(?:tsp|tbsp|teaspoons?|tablespoons?)\b/i;

export interface LabelViolation {
  item: string;
  detail: string;
}

/**
 * Gochujang given a bare gram quantity with no spoon anywhere in its label.
 *
 * The grams-as-quantity exception above is about the MACRO path; it was never a licence to drop the
 * volume entirely. Jason measures it with a spoon and asked for it back on 2026-08-23:
 * *"gochujang is showing as 60g ... but that should be measured in teaspoons since you scoop it."*
 *
 * On that date all 7 gochujang rows in the library were wrong, in two OPPOSITE directions: three
 * had bare grams and no spoon (`60 g Gochujang`), and four had the spoon as the QUANTITY
 * (`2.5 tbsp gochujang (45 g)`) — the inverse error, and the one that actually breaks a re-resolve.
 * Both are rejected here.
 */
export function gochujangLabelViolations(rows: RecipeIngredient[] | null): LabelViolation[] {
  if (!rows) return [];
  const out: LabelViolation[] = [];
  for (const r of rows) {
    if (!NO_USDA_PORTION.test(r.item)) continue;
    if (r.quantity == null) continue;
    if (r.unit !== "g") {
      out.push({
        item: r.item,
        detail:
          `quantity is "${r.quantity} ${r.unit}" — gochujang keeps GRAMS as the quantity ` +
          `(1 tbsp = 20 g) and carries the spoon in its label, e.g. ` +
          `{ quantity: 20, unit: "g", item: "gochujang (1 tbsp)" }`,
      });
      continue;
    }
    if (!SPOON_IN_LABEL.test(r.item)) {
      const tbsp = r.quantity / 20;
      const spoon =
        tbsp >= 1 ? `${+tbsp.toFixed(2)} tbsp` : `${+(r.quantity / 6.7).toFixed(1)} tsp`;
      out.push({
        item: r.item,
        detail: `${r.quantity} g with no spoon in the label — write "gochujang (${spoon})"`,
      });
    }
  }
  return out;
}

/**
 * Rice must be NAMED so the render-time `go` annotation can fire.
 *
 * Jason measures rice with the 180 ml Japanese cup (1 go = 150 g dry) and nothing else.
 * `annotateRice` in `lib/units.ts` appends that conversion automatically — you never write it into
 * a structured row — but it matches against the RENDERED line and only in two shapes:
 *
 *     "<n> g dry <grain> rice"      -> "150 g dry brown rice"    (1 go)
 *     "<n> g cooked white|brown rice" -> "220 g cooked brown rice" (~80 g dry = 0.5 go)
 *
 * So `dry`/`cooked` has to sit BETWEEN the grams and the word `rice`, with at most one word
 * between. `Brown rice, long-grain, DRY` reads correctly to a human and matches nothing — on
 * 2026-08-23, 9 rice lines across 5 recipes rendered no `go` at all for exactly that reason, and
 * the defect was invisible because the text looked right.
 */
const RICE_ITEM = /\brice\b/i;
const RICE_NOT_GRAIN = /\brice\s+(vinegar|powder|paper|wine|flour|noodles?|cakes?|krispies)\b/i;
const RICE_DRY = /(\d+(?:\.\d+)?)\s*g\s+dry\s+(?:\w+\s+)?rice\b/i;
const RICE_COOKED = /(\d+(?:\.\d+)?)\s*g\s+cooked\s+(white|brown)\s+rice\b/i;
const ALREADY_GO = /\bgo\b/i;

export function riceNamingViolations(rows: RecipeIngredient[] | null): LabelViolation[] {
  if (!rows) return [];
  const out: LabelViolation[] = [];
  for (const r of rows) {
    if (!RICE_ITEM.test(r.item) || RICE_NOT_GRAIN.test(r.item)) continue;
    if (r.quantity == null || r.unit !== "g") continue;
    // Mirror how `formatIngredient` builds the line: quantity, unit, then item.
    const head = `${+r.quantity.toFixed(2)} ${r.unit} ${r.item}`;
    if (ALREADY_GO.test(head) || RICE_DRY.test(head) || RICE_COOKED.test(head)) continue;
    out.push({
      item: r.item,
      detail:
        `renders as "${head}", which annotateRice cannot match, so no go is shown. ` +
        `Name it "dry <grain> rice, ..." or "cooked white|brown rice, ..." — e.g. ` +
        `"dry brown rice, long-grain"`,
    });
  }
  return out;
}

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
  const badGoch = gochujangLabelViolations(rows);
  if (badGoch.length) {
    throw new RecipeShapeError(
      "ingredients_json: gochujang keeps grams as the quantity and carries the spoon in its " +
        "label. " +
        badGoch.map((b) => `"${b.item}": ${b.detail}`).join("; "),
    );
  }

  const badRice = riceNamingViolations(rows);
  if (badRice.length) {
    throw new RecipeShapeError(
      "ingredients_json: rice must be named so the go annotation renders. " +
        badRice.map((b) => `"${b.item}": ${b.detail}`).join("; "),
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
