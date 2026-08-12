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

export function parseIngredientRows(raw: unknown): RecipeIngredient[] | null {
  if (raw == null) return null;
  if (!Array.isArray(raw)) throw new RecipeShapeError("ingredients_json: must be an array");
  return raw.map((r, i) => parseIngredientRow(r, `ingredients_json[${i}]`));
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
