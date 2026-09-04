import type { SupabaseClient } from "@supabase/supabase-js";
import type { RecipeIngredient } from "@/lib/types";
import type { InventoryLocation } from "./inventory";

/**
 * Cooking moves mass out of `inventory_items` and into `cooks`.
 *
 * `cooks` is prepared leftovers, `inventory_items` is the raw ingredients they were made from.
 * Nothing connected them, so the fridge kept reporting food that had already been cooked —
 * silently and always in the same direction, over-reporting, which is the direction that makes
 * the next fridge audit plan a meal around food that is gone.
 *
 * THE RULE THIS MODULE EXISTS TO OBEY: a wrong draw is worse than no draw. A missing decrement
 * is a number that is too high and stays visible; a wrong one silently corrupts a count that
 * nothing else can check. So every uncertainty here resolves to SKIP AND SAY SO, never to a
 * guess, and `planDraw` writes nothing — the caller shows the plan, and only an explicit
 * confirmation applies it.
 *
 * WHAT IS DELIBERATELY NEVER DRAWN:
 *   - staples (`quantity` null — "on hand, amount untracked": rice, oil, whey, eggs)
 *   - rows whose unit is not a weight AND carry no declared pack weight (see below)
 *   - ingredient lines with no weight to read
 *   - anything that does not match a stock row confidently
 *
 * COUNTED UNITS (`2 box`, `4 can`, `1 jar`). Inventing a can size is the fabrication the
 * nutrition pipeline forbids, so a bare counted row is still skipped. But a pack weight READ
 * OFF THE LABEL is not an invention — it is the same move `GRAMS_IN_LABEL` already makes for
 * `avocado oil (14 g)`: reading back a figure a human wrote down. So a counted row may declare
 * `metadata.grams_per_unit` (Barilla tri-color: 336 g/box) and is then drawable in fractions of
 * a pack. The number must be entered by a person from the packaging; nothing here derives it,
 * and a row without it is skipped with a message naming the fix rather than guessed at.
 */

// ── Matching ────────────────────────────────────────────────────────────────
//
// Two strategies, tried in this order:
//
//   1. `fdc_id` — recipe lines already pin the USDA record their macros came from. When the
//      stock row carries the same id the match is an equality test, not a judgement.
//   2. Normalized name — strip brand parentheticals, punctuation and state/prep words, reduce
//      to a token set, and require the two sets to be EQUAL.
//
// Set EQUALITY rather than overlap or subset is the whole safety margin. Subset matching looks
// more helpful and is not: "Garlic" ⊂ "Garlic powder", so a recipe wanting fresh garlic would
// quietly draw down the powder. Equality declines that match, `fdc_id` covers the pairs the
// name rule is too strict for, and everything else is reported as unmatched rather than guessed.

/**
 * Words describing STATE, PREP or GRADE — never the food itself. Stripping them lets
 * "Salmon, Atlantic (MOWI) — frozen" and "Salmon, Atlantic, raw" reduce to the same set.
 *
 * Head nouns must never appear here. "ground" stays (ground beef, ground flaxseed), "extra"
 * and "firm" stay (extra firm tofu is not the same purchase as silken), and a grade like
 * "93/7" survives as its own tokens.
 */
const STATE_WORDS = new Set([
  "raw",
  "cooked",
  "uncooked",
  "dry",
  "dried",
  "fresh",
  "frozen",
  "chilled",
  "thawed",
  "organic",
  "canned",
  "tinned",
  "jarred",
  "drained",
  "rinsed",
  "chopped",
  "sliced",
  "diced",
  "cubed",
  "minced",
  "shredded",
  "grated",
  "halved",
  "quartered",
  "peeled",
  "unpeeled",
  "trimmed",
  "boneless",
  "skinless",
  "shelled",
  "whole",
  "large",
  "small",
  "medium",
  "jumbo",
  "lean",
  "only",
  "prepared",
  "packed",
  // Cut and shape. A knife cut describes what was done to the food, never which food it is,
  // so "zucchini, half-moons" and "Zucchini (Baloian Farms)" have to reduce to the same set.
  // These are singular forms because `singularize` runs BEFORE this filter.
  // "round" is deliberately absent — in "beef round" it names the cut of meat, not a shape.
  // "crushed" is absent for the same reason: crushed tomatoes are a distinct product from
  // diced or whole ones, and collapsing them would draw down the wrong can.
  "half",
  "halve",
  "moon",
  "floret",
  "spear",
  "wedge",
  "strip",
  "stick",
  "chunk",
  "piece",
  "cube",
  "matchstick",
  "baton",
  "julienne",
  "julienned",
  "ribbon",
  "crumble",
  "torn",
  "cut",
]);

/** Naive singular form. Applied to both sides, so it only has to be CONSISTENT, not correct. */
function singularize(token: string): string {
  if (token.length > 3 && token.endsWith("ies")) return `${token.slice(0, -3)}y`;
  if (token.length > 3 && token.endsWith("s") && !token.endsWith("ss")) return token.slice(0, -1);
  return token;
}

/**
 * Reduce a food name to a comparable token set.
 *
 * "Gochujang (CJ Haechandle)"  -> {gochujang}
 * "gochujang (3 tbsp)"         -> {gochujang}
 * "Black beans, canned"        -> {black, bean}
 * "Ground beef, 93/7 — frozen" -> {ground, beef, 93, 7}
 *
 * Parentheticals go first and wholesale: they hold brands ("CJ Haechandle"), spoon
 * equivalents ("3 tbsp") and counts ("1 large") — never the identity of the food.
 */
export function normalizeFoodName(raw: string): Set<string> {
  const withoutParens = raw.replace(/\([^)]*\)/g, " ");
  const tokens = withoutParens
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .map(singularize)
    .filter((t) => !STATE_WORDS.has(t));
  return new Set(tokens);
}

function sameFood(a: Set<string>, b: Set<string>): boolean {
  if (a.size === 0 || b.size === 0) return false;
  if (a.size !== b.size) return false;
  for (const t of a) if (!b.has(t)) return false;
  return true;
}

// ── Weights ─────────────────────────────────────────────────────────────────

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

/** A gram figure the recipe author wrote into the label, e.g. "avocado oil (27 g)". */
const GRAMS_IN_LABEL = /\((\d+(?:\.\d+)?)\s*g\)/i;

/**
 * Grams for one ingredient line, or null when there is no weight to read.
 *
 * Spoon-measured lines (`2 tsp toasted sesame oil`) carry their grams in the label by the
 * convention the recipe invariants enforce, so reading it back is reading what the author
 * wrote — not deriving a density. With neither a weight unit nor a labelled gram figure the
 * line has no weight, and the answer is null rather than an assumption.
 */
export function gramsForIngredient(line: RecipeIngredient): number | null {
  const unit = line.unit?.trim().toLowerCase() ?? "";
  if (line.quantity != null && GRAMS_PER[unit] != null) {
    return line.quantity * GRAMS_PER[unit];
  }
  const labelled = line.item.match(GRAMS_IN_LABEL);
  if (labelled) return parseFloat(labelled[1]);
  return null;
}

/**
 * Grams in one of an inventory row's units.
 *
 * A weight unit answers from the table. Anything else (`box`, `can`, `jar`) answers only from a
 * `grams_per_unit` a person transcribed off the packaging — never from a derivation. Zero,
 * negatives and non-finite values are rejected rather than allowed to produce an infinite or
 * inverted draw.
 */
export function gramsPerUnitFor(unit: string | null, declared?: number | null): number | null {
  const factor = GRAMS_PER[unit?.trim().toLowerCase() ?? ""];
  if (factor != null) return factor;
  if (declared != null && Number.isFinite(declared) && declared > 0) return declared;
  return null;
}

/** Grams expressed in an inventory row's own unit, or null when there is no honest conversion. */
export function gramsToUnit(
  grams: number,
  unit: string | null,
  declared?: number | null,
): number | null {
  const factor = gramsPerUnitFor(unit, declared);
  if (factor == null) return null;
  return grams / factor;
}

// ── Types ───────────────────────────────────────────────────────────────────

export interface PlannedDraw {
  ingredient: string;
  itemId: string;
  itemName: string;
  location: InventoryLocation;
  unit: string | null;
  /** How the row was identified. A bad draw is traceable to the strategy that produced it. */
  matchMethod: "fdc_id" | "name";
  gramsRequested: number;
  gramsApplied: number;
  quantityBefore: number;
  /** Clamped at what the row actually holds — see `shortfallGrams`. */
  quantityApplied: number;
  quantityAfter: number;
  /** > 0 when the kitchen did not hold enough. Reported, never silently rounded away. */
  shortfallGrams: number;
  /** Other stock rows that matched but were not drawn from. */
  otherCandidates: number;
}

export type SkipReason =
  | "staple"
  | "no-weight-in-recipe"
  | "no-match"
  | "unconvertible-unit"
  | "out-of-stock";

export interface SkippedLine {
  ingredient: string;
  grams: number | null;
  reason: SkipReason;
  /** Rendered to the user as-is — a skip has to explain itself or it reads as a failure. */
  detail: string;
}

export interface DrawPlan {
  recipeId: string;
  recipeName: string;
  portionsCooked: number;
  typicalPortions: number;
  /** `portionsCooked / typicalPortions`. See the batch note on `planDraw`. */
  scale: number;
  draws: PlannedDraw[];
  skips: SkippedLine[];
}

// Perishable-first. The same protein can sit in both the fridge and the freezer, and the fridge
// copy is the one with a deadline — drawing the frozen one first would leave the perishable to
// rot while the count still looked right.
const LOCATION_PRIORITY: Record<InventoryLocation, number> = {
  fridge: 0,
  counter: 1,
  freezer: 2,
  pantry: 3,
};

interface StockRow {
  id: string;
  name: string;
  quantity: number | null;
  unit: string | null;
  location: InventoryLocation;
  expires_on: string | null;
  fdc_id: number | null;
  /** `grams_per_unit` here is what makes a counted row (`2 box`) drawable. */
  metadata: { grams_per_unit?: number | null } | null;
}

/** The pack weight a person recorded on a counted row, if any. */
function declaredGramsPerUnit(row: { metadata?: { grams_per_unit?: number | null } | null }) {
  return row.metadata?.grams_per_unit ?? null;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

// ── Planning ────────────────────────────────────────────────────────────────

/**
 * Work out what cooking this recipe would take out of the kitchen. WRITES NOTHING.
 *
 * THE BATCH SCALE. `ingredients_json` describes the WHOLE BATCH — `typical_portions` servings
 * of it — while `recipes.calories` describes ONE serving (`recipe-portions.ts` owns that
 * split). So the raw draw is the ingredient list times `portionsCooked / typicalPortions`:
 * cooking 4 portions of a 4-portion recipe draws the list once, cooking 2 draws half of it.
 * Reading the list as per-serving would draw four times the chicken that was actually used.
 */
export async function planDraw(
  db: SupabaseClient,
  userId: string,
  input: { recipeId: string; portionsCooked: number },
): Promise<DrawPlan> {
  const { data: recipe, error } = await db
    .from("recipes")
    .select("id, name, ingredients_json, typical_portions")
    .eq("id", input.recipeId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(`recipe load failed: ${error.message}`);
  if (!recipe) throw new Error("Recipe not found");

  const { data: stockRows, error: stockErr } = await db
    .from("inventory_items")
    .select("id, name, quantity, unit, location, expires_on, fdc_id, metadata")
    .eq("user_id", userId);
  if (stockErr) throw new Error(`inventory load failed: ${stockErr.message}`);

  const stock = (stockRows ?? []) as StockRow[];
  const typicalPortions = (recipe.typical_portions as number | null) ?? 1;
  const scale = input.portionsCooked / typicalPortions;
  const lines = (recipe.ingredients_json as RecipeIngredient[] | null) ?? [];

  const draws: PlannedDraw[] = [];
  const skips: SkippedLine[] = [];
  // Two lines can name the same stock row (a marinade and a sauce both wanting gochujang).
  // Track what earlier lines already claimed so the second one sees the reduced quantity
  // rather than both drawing against the original figure.
  const claimed = new Map<string, number>();

  for (const line of lines) {
    const label = line.item;
    const gramsPerBatch = gramsForIngredient(line);

    if (gramsPerBatch == null) {
      skips.push({
        ingredient: label,
        grams: null,
        reason: "no-weight-in-recipe",
        detail: `no weight on this line (${line.quantity ?? "?"} ${line.unit ?? "—"})`,
      });
      continue;
    }

    const gramsRequested = round2(gramsPerBatch * scale);
    const nameTokens = normalizeFoodName(label);

    // fdc_id first: an equality test beats any amount of string cleverness.
    let candidates = line.fdc_id
      ? stock.filter((s) => s.fdc_id != null && s.fdc_id === line.fdc_id)
      : [];
    let matchMethod: "fdc_id" | "name" = "fdc_id";
    if (candidates.length === 0) {
      candidates = stock.filter((s) => sameFood(nameTokens, normalizeFoodName(s.name)));
      matchMethod = "name";
    }

    if (candidates.length === 0) {
      skips.push({
        ingredient: label,
        grams: gramsRequested,
        reason: "no-match",
        detail: "nothing in the kitchen matches this by USDA id or name",
      });
      continue;
    }

    const staples = candidates.filter((c) => c.quantity == null);
    const tracked = candidates.filter((c) => c.quantity != null);

    if (tracked.length === 0) {
      skips.push({
        ingredient: label,
        grams: gramsRequested,
        reason: "staple",
        detail: `${staples[0].name} is a staple (amount untracked)`,
      });
      continue;
    }

    const weighable = tracked.filter(
      (c) => gramsPerUnitFor(c.unit, declaredGramsPerUnit(c)) != null,
    );
    if (weighable.length === 0) {
      const t = tracked[0];
      skips.push({
        ingredient: label,
        grams: gramsRequested,
        reason: "unconvertible-unit",
        // Name the fix. This skip used to be terminal for every counted row, so it read as a
        // limitation; it is now a missing figure, and saying which figure is what closes it.
        detail: `${t.name} is stocked as "${t.quantity} ${t.unit ?? "—"}" — set its pack weight (grams per ${t.unit ?? "unit"}) from the label to draw it`,
      });
      continue;
    }

    // Perishable-first, then soonest-to-expire: within the fridge, spend the thing with the
    // nearest deadline. Rows with no expiry sort last — they are the ones that can wait.
    weighable.sort((a, b) => {
      const loc = LOCATION_PRIORITY[a.location] - LOCATION_PRIORITY[b.location];
      if (loc !== 0) return loc;
      if (a.expires_on && b.expires_on) return a.expires_on.localeCompare(b.expires_on);
      if (a.expires_on) return -1;
      if (b.expires_on) return 1;
      return a.name.localeCompare(b.name);
    });

    const row = weighable[0];
    const available = round2((row.quantity as number) - (claimed.get(row.id) ?? 0));
    if (available <= 0) {
      skips.push({
        ingredient: label,
        grams: gramsRequested,
        reason: "out-of-stock",
        detail: `${row.name} has none left`,
      });
      continue;
    }

    // Requested amount in the ROW's unit — the row is what gets written, so the clamp and the
    // ledger both have to happen in its unit rather than in grams.
    const perUnit = gramsPerUnitFor(row.unit, declaredGramsPerUnit(row)) as number;
    const requestedInUnit = round2(gramsRequested / perUnit);
    const quantityApplied = round2(Math.min(requestedInUnit, available));
    const gramsApplied = round2(quantityApplied * perUnit);

    claimed.set(row.id, round2((claimed.get(row.id) ?? 0) + quantityApplied));

    draws.push({
      ingredient: label,
      itemId: row.id,
      itemName: row.name,
      location: row.location,
      unit: row.unit,
      matchMethod,
      gramsRequested,
      gramsApplied,
      quantityBefore: available,
      quantityApplied,
      quantityAfter: round2(available - quantityApplied),
      shortfallGrams: round2(Math.max(0, gramsRequested - gramsApplied)),
      otherCandidates: weighable.length - 1,
    });
  }

  return {
    recipeId: recipe.id as string,
    recipeName: recipe.name as string,
    portionsCooked: input.portionsCooked,
    typicalPortions,
    scale,
    draws,
    skips,
  };
}

// ── Applying ────────────────────────────────────────────────────────────────

/**
 * Apply a plan: subtract from each row and write the ledger.
 *
 * Re-reads every row and re-clamps rather than trusting the plan's `quantityBefore`. A plan is
 * shown to a human and confirmed some seconds later, and in between the row can have changed —
 * applying a stale figure would write a quantity that was never true.
 *
 * The ledger row records the delta ACTUALLY applied, in the row's own unit. That is what a
 * reversal has to give back: a 60 g request against a 40 g row draws 40, and recomputing "60"
 * from the recipe at delete time would hand back 20 g that never left.
 *
 * Failures are per-row and non-fatal. The cook has already happened — the food is out of the
 * fridge whatever the bookkeeping does — so a failed decrement is reported, not thrown.
 */
export async function applyDraw(
  db: SupabaseClient,
  userId: string,
  cookId: string,
  plan: DrawPlan,
): Promise<{ applied: PlannedDraw[]; failed: { ingredient: string; error: string }[] }> {
  const applied: PlannedDraw[] = [];
  const failed: { ingredient: string; error: string }[] = [];

  for (const draw of plan.draws) {
    try {
      const { data: row, error: readErr } = await db
        .from("inventory_items")
        .select("id, quantity, unit, metadata")
        .eq("id", draw.itemId)
        .eq("user_id", userId)
        .maybeSingle();
      if (readErr) throw new Error(readErr.message);
      if (!row || row.quantity == null) throw new Error("item is gone or is now a staple");

      const current = Number(row.quantity);
      const quantityApplied = round2(Math.min(draw.quantityApplied, current));
      if (quantityApplied <= 0) throw new Error("nothing left to draw");

      const { error: updErr } = await db
        .from("inventory_items")
        .update({
          quantity: round2(current - quantityApplied),
          updated_at: new Date().toISOString(),
        })
        .eq("id", draw.itemId)
        .eq("user_id", userId);
      if (updErr) throw new Error(updErr.message);

      const perUnit = gramsPerUnitFor(row.unit, declaredGramsPerUnit(row));
      if (perUnit == null) throw new Error("item no longer has a usable pack weight");
      const gramsApplied = round2(quantityApplied * perUnit);

      const { error: ledgerErr } = await db.from("inventory_draws").insert({
        user_id: userId,
        inventory_item_id: draw.itemId,
        cook_id: cookId,
        quantity_applied: quantityApplied,
        unit: row.unit,
        grams_requested: draw.gramsRequested,
        grams_applied: gramsApplied,
        ingredient_label: draw.ingredient,
        match_method: draw.matchMethod,
      });
      if (ledgerErr) throw new Error(ledgerErr.message);

      applied.push({
        ...draw,
        quantityBefore: current,
        quantityApplied,
        quantityAfter: round2(current - quantityApplied),
        gramsApplied,
        shortfallGrams: round2(Math.max(0, draw.gramsRequested - gramsApplied)),
      });
    } catch (err) {
      failed.push({
        ingredient: draw.ingredient,
        error: err instanceof Error ? err.message : "draw failed",
      });
    }
  }

  return { applied, failed };
}
