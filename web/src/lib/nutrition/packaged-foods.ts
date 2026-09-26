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

// One string literal, deliberately not concatenated and deliberately not wrapped: supabase-js
// parses the select at the TYPE level, and a runtime-built string degrades the result to
// GenericStringError[] so the row cast stops compiling. Long line beats a broken return type.
// prettier-ignore
const SELECT = "id, brand, product, upc, serving_size_g, serving_label, servings_per_container, net_weight_g, prep_state, calories_per_100g, protein_per_100g, carbs_per_100g, fat_per_100g, fiber_per_100g, sugar_per_100g, sodium_mg_per_100g, fdc_proxy_id, label_photographed_on, notes";

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

/**
 * Every catalog row a recipe pins, in one query. Rows that do not exist (deleted, or another
 * user's id) are simply absent from the map — the caller reports that pin as unresolved.
 */
export async function findPackagedFoodsByIds(
  db: SupabaseClient,
  userId: string,
  ids: string[],
): Promise<Map<string, PackagedFoodRow>> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return new Map();
  const { data, error } = await db
    .from("packaged_foods")
    .select(SELECT)
    .eq("user_id", userId)
    .in("id", unique);
  if (error) throw new Error(`packaged_foods lookup failed: ${error.message}`);
  return new Map(((data ?? []) as PackagedFoodRow[]).map((r) => [r.id, r]));
}

// ── Pricing an ingredient off a label ─────────────────────────────────────────

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

const SERVING_UNITS = new Set(["serving", "servings"]);

/** Whole-container units. Priced off `containerWeightG`, never off a guessed can size. */
const CONTAINER_UNITS = new Set([
  "box",
  "boxes",
  "jar",
  "jars",
  "can",
  "cans",
  "bag",
  "bags",
  "package",
  "packages",
  "pack",
  "packs",
  "container",
  "containers",
  "bottle",
  "bottles",
  "carton",
  "cartons",
  "tub",
  "tubs",
]);

/** One spelling per unit, so `tablespoons` on a recipe line meets `tbsp` on a label. */
function canonicalUnit(unit: string): string {
  const u = unit.trim().toLowerCase().replace(/\.$/, "");
  if (/^(tsp|teaspoons?)$/.test(u)) return "tsp";
  if (/^(tbsp|tbs|tablespoons?)$/.test(u)) return "tbsp";
  if (/^cups?$/.test(u)) return "cup";
  return u.length > 3 && u.endsWith("s") ? u.slice(0, -1) : u;
}

/**
 * The household measure printed beside the serving weight: "1 tsp" -> {1, tsp}, "1/2 cup" ->
 * {0.5, cup}, "3/4 cup frozen" -> {0.75, cup}, "1 fillet" -> {1, fillet}. Null when the label
 * gives no leading amount, or when the measure is itself a weight ("2 oz") — mass units are
 * converted exactly and need no label to do it.
 */
export function parseServingLabel(label: string | null): { qty: number; unit: string } | null {
  if (!label) return null;
  const m = label.trim().match(/^(\d+(?:\.\d+)?)(?:\s*\/\s*(\d+))?\s+([a-zA-Z]+)/);
  if (!m) return null;
  const qty = m[2] ? Number(m[1]) / Number(m[2]) : Number(m[1]);
  if (!Number.isFinite(qty) || qty <= 0) return null;
  const unit = canonicalUnit(m[3]);
  if (unit in GRAMS_PER) return null;
  return { qty, unit };
}

/**
 * Grams for `qty unit` of a labelled food, or null when the label cannot price that unit.
 *
 * Only figures READ OFF THE PACKAGE are used: mass conversions, the printed serving weight,
 * the printed household measure beside it, and the container weight. A unit none of those
 * cover (`2 tbsp` of a food labelled per `2 oz`) is refused rather than converted through a
 * density nobody measured.
 *
 * `exact` is false only for a container priced from servings x serving size, because
 * "about 5 servings" is itself rounded — see `containerWeightG`.
 */
export function labelGramsFor(
  row: PackagedFoodRow,
  qty: number,
  unit: string,
): { grams: number; exact: boolean; basis: string } | null {
  if (!Number.isFinite(qty) || qty <= 0) return null;
  const raw = unit.trim().toLowerCase();
  const name = `${row.brand} ${row.product}`;

  if (raw in GRAMS_PER) {
    return { grams: qty * GRAMS_PER[raw], exact: true, basis: `label: ${name}, by weight` };
  }
  if (SERVING_UNITS.has(raw)) {
    return {
      grams: qty * row.serving_size_g,
      exact: true,
      basis: `label: 1 serving = ${row.serving_size_g} g`,
    };
  }
  if (CONTAINER_UNITS.has(raw)) {
    const c = containerWeightG(row);
    if (!c) return null;
    return c.source === "net_weight"
      ? { grams: qty * c.grams, exact: true, basis: `label: net weight ${c.grams} g` }
      : {
          grams: qty * c.grams,
          exact: false,
          basis:
            `label: container INFERRED as ${row.servings_per_container} x ` +
            `${row.serving_size_g} g servings — net weight unread`,
        };
  }
  const printed = parseServingLabel(row.serving_label);
  if (printed && printed.unit === canonicalUnit(raw)) {
    return {
      grams: (qty / printed.qty) * row.serving_size_g,
      exact: true,
      basis: `label: ${row.serving_label} = ${row.serving_size_g} g`,
    };
  }
  return null;
}

/** Words that state a preparation state, by the `prep_state` they assert. */
const STATE_WORDS: Record<Exclude<PrepState, "as_sold">, RegExp> = {
  dry: /\b(dry|dried|uncooked)\b/i,
  cooked: /\b(cooked|boiled|plated)\b/i,
  drained: /\b(drained)\b/i,
  prepared: /\b(prepared)\b/i,
};

/**
 * Why this ingredient cannot be priced off this label, or null when it can.
 *
 * Label macros describe ONE state of the food. Pasta weighs ~2.5-3x more cooked than dry, so
 * pricing a plated weight off a dry label overstates the meal by that factor — the same class of
 * error as the resolver rewriting "2 cups dry brown rice" to cooked rice and reporting it "high".
 *
 * For the states where weight changes (`dry`, `cooked`, `drained`, `prepared`) the ingredient must
 * SAY the matching state: silence is refused, because an unqualified "300 g pasta" is exactly the
 * ambiguity that produced those errors. An `as_sold` label only refuses a line that names another
 * post-purchase state — "ground beef, 93/7" is as-sold without needing to say so.
 */
export function labelStateConflict(row: PackagedFoodRow, ingredientText: string): string | null {
  const stated = (Object.keys(STATE_WORDS) as (keyof typeof STATE_WORDS)[]).filter((s) =>
    STATE_WORDS[s].test(ingredientText),
  );

  if (row.prep_state === "as_sold") {
    // "dry"/"dried" is not a conflict here: dried apricots are sold dried. Only a state that
    // changes the weight after purchase is.
    const changed = stated.filter((s) => s !== "dry");
    return changed.length ? `label is as sold, but the ingredient says ${changed.join("/")}` : null;
  }
  if (!stated.includes(row.prep_state)) {
    return stated.length
      ? `label is ${row.prep_state} weight, but the ingredient says ${stated.join("/")}`
      : `label is ${row.prep_state} weight — say "${row.prep_state}" on the ingredient to confirm the amount is ${row.prep_state}`;
  }
  const other = stated.filter((s) => s !== row.prep_state);
  return other.length
    ? `label is ${row.prep_state} weight, but the ingredient also says ${other.join("/")}`
    : null;
}

// ── Catalog writes (#722 capture path) ────────────────────────────────────────

/** A catalog entry as a person enters it: the printed panel, per SERVING, plus its identity. */
export interface PackagedFoodInput {
  brand: string;
  product: string;
  upc: string | null;
  serving_size_g: number;
  serving_label: string | null;
  servings_per_container: number | null;
  net_weight_g: number | null;
  prep_state: PrepState;
  label_photographed_on: string | null;
  fdc_proxy_id: number | null;
  notes: string | null;
  panel: LabelPanel;
}

/** The columns written for an input — per 100 g, with the panel divided exactly once. */
export type PackagedFoodWrite = Omit<PackagedFoodInput, "panel"> & Per100g;

export class PackagedFoodInputError extends Error {}

function bad(field: string, why: string): never {
  throw new PackagedFoodInputError(`${field} ${why}`);
}

function text(v: unknown, field: string, required: boolean): string | null {
  if (v == null || (typeof v === "string" && v.trim() === "")) {
    if (required) bad(field, "is required");
    return null;
  }
  if (typeof v !== "string") bad(field, "must be text");
  return v.trim();
}

function num(v: unknown, field: string, opts: { required?: boolean; positive?: boolean } = {}) {
  if (v == null || v === "") {
    if (opts.required) bad(field, "is required");
    return null;
  }
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) bad(field, "must be a number");
  if (opts.positive ? n <= 0 : n < 0) bad(field, opts.positive ? "must be > 0" : "must be >= 0");
  return n;
}

/**
 * Validate a catalog entry. Rejects rather than coerces, like `parseIngredientRow`: a label typed
 * wrong is a macro error on every meal it prices, so a malformed number must not be "repaired".
 *
 * Writes are whole-entry: the edit form sends the full panel back, so there is one validator and
 * no partial-update path where half a panel could pair with the other half of an old one.
 */
export function parsePackagedFoodInput(raw: unknown): PackagedFoodInput {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) bad("body", "must be an object");
  const r = raw as Record<string, unknown>;
  const p = (r.panel ?? {}) as Record<string, unknown>;

  const prep = r.prep_state ?? "as_sold";
  if (typeof prep !== "string" || !(PREP_STATES as readonly string[]).includes(prep)) {
    bad("prep_state", `must be one of: ${PREP_STATES.join(", ")}`);
  }

  const photographed = text(r.label_photographed_on, "label_photographed_on", false);
  if (photographed && !/^\d{4}-\d{2}-\d{2}$/.test(photographed)) {
    bad("label_photographed_on", "must be a YYYY-MM-DD date");
  }

  const upc = text(r.upc, "upc", false);
  if (upc && !/^\d{6,14}$/.test(upc)) bad("upc", "must be 6-14 digits");

  const proxy = num(r.fdc_proxy_id, "fdc_proxy_id", { positive: true });
  if (proxy != null && !Number.isInteger(proxy)) bad("fdc_proxy_id", "must be an integer");

  const servingG = num(p.servingSizeG ?? r.serving_size_g, "serving size (g)", {
    required: true,
    positive: true,
  }) as number;

  return {
    brand: text(r.brand, "brand", true) as string,
    product: text(r.product, "product", true) as string,
    upc,
    serving_size_g: servingG,
    serving_label: text(r.serving_label, "serving_label", false),
    servings_per_container: num(r.servings_per_container, "servings per container", {
      positive: true,
    }),
    net_weight_g: num(r.net_weight_g, "net weight (g)", { positive: true }),
    prep_state: prep as PrepState,
    label_photographed_on: photographed,
    fdc_proxy_id: proxy,
    notes: text(r.notes, "notes", false),
    panel: {
      servingSizeG: servingG,
      calories: num(p.calories, "calories", { required: true }) as number,
      proteinG: num(p.proteinG, "protein", { required: true }) as number,
      carbsG: num(p.carbsG, "carbs", { required: true }) as number,
      fatG: num(p.fatG, "fat", { required: true }) as number,
      fiberG: num(p.fiberG, "fiber"),
      sugarG: num(p.sugarG, "sugar"),
      sodiumMg: num(p.sodiumMg, "sodium"),
    },
  };
}

/** Input -> the row's columns. The one place a create or edit divides the panel. */
export function toPackagedFoodWrite(input: PackagedFoodInput): PackagedFoodWrite {
  const { panel, ...rest } = input;
  return { ...rest, ...labelToPer100g(panel) };
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/**
 * The per-serving panel reconstructed from a stored row, for the edit form. Rounded to 0.1 so it
 * reads like a label; saving it unchanged re-derives the stored per-100 g to within that rounding.
 */
export function panelFromRow(row: PackagedFoodRow): LabelPanel {
  const f = row.serving_size_g / 100;
  const opt = (v: number | null) => (v == null ? null : round1(v * f));
  return {
    servingSizeG: row.serving_size_g,
    calories: round1(row.calories_per_100g * f),
    proteinG: round1(row.protein_per_100g * f),
    carbsG: round1(row.carbs_per_100g * f),
    fatG: round1(row.fat_per_100g * f),
    fiberG: opt(row.fiber_per_100g),
    sugarG: opt(row.sugar_per_100g),
    sodiumMg: opt(row.sodium_mg_per_100g),
  };
}

/**
 * Split a printed serving line into its household measure and its gram figure:
 * "2 oz (56g)" -> {label: "2 oz", grams: 56}; "1 tsp (6 g)" -> {label: "1 tsp", grams: 6};
 * "56g" -> {label: null, grams: 56}. Grams are null when the line prints none — the reader must
 * then ask, never convert "1/2 cup" through a density nobody measured.
 */
export function splitServingText(raw: string | null): {
  label: string | null;
  grams: number | null;
} {
  if (!raw) return { label: null, grams: null };
  const s = raw.trim();
  const g = s.match(/(\d+(?:\.\d+)?)\s*g(?:rams?)?\b/i);
  const grams = g ? Number(g[1]) : null;
  const label = s
    .replace(/\(?\s*\d+(?:\.\d+)?\s*g(?:rams?)?\b\s*\)?/i, "")
    .replace(/[()]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return { label: label || null, grams: grams && grams > 0 ? grams : null };
}

/** How old a label may get before the catalog asks for a fresh photo. Formulations drift. */
export const LABEL_STALE_DAYS = 365;

/** What a catalog row is missing or due for, as short flags for the list view. */
export function catalogFlags(row: PackagedFoodRow, today: string): string[] {
  const flags: string[] = [];
  const age =
    (Date.parse(`${today}T00:00:00Z`) - Date.parse(`${row.label_photographed_on}T00:00:00Z`)) /
    86_400_000;
  if (Number.isFinite(age) && age > LABEL_STALE_DAYS) {
    flags.push(`label photographed ${Math.floor(age)} days ago — re-photograph`);
  }
  if (row.net_weight_g == null) {
    flags.push(
      row.servings_per_container == null
        ? "no net weight — a whole container cannot be priced"
        : "no net weight — a whole container is inferred from servings",
    );
  }
  return flags;
}

/** Postgres unique violations on the catalog's two identity indexes, as a person would say it. */
function duplicateMessage(err: { code?: string; message: string }): string | null {
  if (err.code !== "23505") return null;
  return /upc/i.test(err.message)
    ? "that barcode is already in the catalog"
    : "that brand + product is already in the catalog";
}

export async function createPackagedFood(
  db: SupabaseClient,
  userId: string,
  input: PackagedFoodInput,
): Promise<PackagedFoodRow> {
  const write = toPackagedFoodWrite(input);
  const { label_photographed_on, ...rest } = write;
  const { data, error } = await db
    .from("packaged_foods")
    .insert({
      ...rest,
      ...(label_photographed_on ? { label_photographed_on } : {}),
      user_id: userId,
    })
    .select(SELECT)
    .single();
  if (error) {
    const dup = duplicateMessage(error);
    if (dup) throw new PackagedFoodInputError(dup);
    throw new Error(`packaged_foods insert failed: ${error.message}`);
  }
  return data as PackagedFoodRow;
}

export async function updatePackagedFood(
  db: SupabaseClient,
  userId: string,
  id: string,
  input: PackagedFoodInput,
): Promise<PackagedFoodRow> {
  const write = toPackagedFoodWrite(input);
  const { label_photographed_on, ...rest } = write;
  const { data, error } = await db
    .from("packaged_foods")
    .update({
      ...rest,
      ...(label_photographed_on ? { label_photographed_on } : {}),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("user_id", userId)
    .select(SELECT)
    .maybeSingle();
  if (error) {
    const dup = duplicateMessage(error);
    if (dup) throw new PackagedFoodInputError(dup);
    throw new Error(`packaged_foods update failed: ${error.message}`);
  }
  if (!data) throw new PackagedFoodInputError("product not found");
  return data as PackagedFoodRow;
}

/**
 * Remove a catalog entry — refused while any recipe line pins it.
 *
 * Inventory links clear themselves (`on delete set null`), but a recipe pin lives inside
 * `ingredients_json` where no foreign key reaches. Deleting under it would turn every pinned line
 * into "pinned packaged food not found" on the next resolve. So say which recipes to re-pin first.
 */
export async function deletePackagedFood(
  db: SupabaseClient,
  userId: string,
  id: string,
): Promise<void> {
  const { data: pinned, error: pinErr } = await db
    .from("recipes")
    .select("name")
    .eq("user_id", userId)
    .contains("ingredients_json", [{ packaged_food_id: id }]);
  if (pinErr) throw new Error(`recipe pin check failed: ${pinErr.message}`);
  if (pinned && pinned.length) {
    throw new PackagedFoodInputError(
      `still pinned by ${pinned.length} recipe(s): ${pinned.map((r) => r.name).join(", ")} — ` +
        "re-pin those lines first",
    );
  }

  const { error } = await db.from("packaged_foods").delete().eq("id", id).eq("user_id", userId);
  if (error) throw new Error(`packaged_foods delete failed: ${error.message}`);
}

// ── Logging a meal off a label (#722) ─────────────────────────────────────────

/** A meal_log row's macro columns, rounded the way the table stores them. */
export interface LabelServingLog {
  grams: number;
  basis: string;
  exact: boolean;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g: number | null;
  sugar_g: number | null;
  sodium_mg: number | null;
}

/**
 * Price an amount of a catalog product for the meal log, or say why not.
 *
 * A meal log carries no ingredient text for `labelStateConflict` to read, so a label that is not
 * `as_sold` needs the eater to CONFIRM the amount is in the label's state: "170 g" of a dry pasta
 * label means 170 g out of the box, which is ~2.5-3x the calories of 170 g on the plate. Without
 * the confirmation a plated weight is refused rather than logged ~3x high.
 */
export function priceLabelServing(
  row: PackagedFoodRow,
  qty: number,
  unit: string,
  confirmedState: string | null,
): LabelServingLog | { refused: string } {
  if (row.prep_state !== "as_sold" && confirmedState !== row.prep_state) {
    return {
      refused: `this label is ${row.prep_state} weight — confirm the amount is ${row.prep_state}, not plated`,
    };
  }
  const g = labelGramsFor(row, qty, unit);
  if (!g) {
    return {
      refused:
        `the label cannot price "${unit}" — use g/oz, servings, a container` +
        (row.serving_label ? `, or ${row.serving_label}` : ""),
    };
  }
  const m = macrosForGrams(row, g.grams);
  const r1 = (n: number) => Math.round(n * 10) / 10;
  return {
    grams: Math.round(g.grams * 10) / 10,
    basis: g.basis,
    exact: g.exact,
    // meal_log.calories is an integer column; the rest are numeric(6,1).
    calories: Math.round(m.calories),
    protein_g: r1(m.protein_g),
    carbs_g: r1(m.carbs_g),
    fat_g: r1(m.fat_g),
    // Null, not 0, when the label did not print it: "not printed" and "none" are different facts.
    fiber_g: row.fiber_per_100g == null ? null : r1(m.fiber_g),
    sugar_g: row.sugar_per_100g == null ? null : r1(m.sugar_g),
    sodium_mg: row.sodium_mg_per_100g == null ? null : Math.round(m.sodium_mg),
  };
}
