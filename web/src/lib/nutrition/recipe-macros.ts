import type { SupabaseClient } from "@supabase/supabase-js";
import { perPortion, storedMacrosFor } from "./recipe-portions";
import type { RecipeMacroTotals } from "./recipe-portions";
import { estimateFromStructured, estimateFromText } from "./estimate";
import type { ParsedFood } from "./parse";
import type { RecipeIngredient } from "../types";

/**
 * Narrow whatever came back from the jsonb column into ingredient rows.
 *
 * The column is checked to be a JSON array at the database level but nothing constrains its
 * ELEMENTS, and this value feeds the macro pipeline — so a malformed row must be dropped here
 * rather than reaching USDA as `undefined`. Anything without a usable `item` string is discarded.
 */
function asIngredientRows(raw: unknown): RecipeIngredient[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((r): r is RecipeIngredient => {
    if (!r || typeof r !== "object") return false;
    const item = (r as RecipeIngredient).item;
    return typeof item === "string" && item.trim().length > 0;
  });
}

/**
 * Structured rows -> the shape estimateOne consumes.
 *
 * Rows with no quantity are dropped, not guessed at: "salt, to taste" is an author stating there
 * is no amount, which is different from prose that merely failed to mention one. Feeding it
 * forward would invent a serving and drag the confidence down for an ingredient that genuinely
 * contributes nothing.
 *
 * `prep` is folded into the query because it changes which USDA record is correct — "cooked" vs
 * "raw" chicken is a ~40% difference in calories per 100 g, and a pinned fdc_id is the only other
 * way to express that.
 */
function toParsedFoods(rows: RecipeIngredient[]): ParsedFood[] {
  return rows
    .filter((r) => typeof r.quantity === "number" && Number.isFinite(r.quantity) && r.quantity > 0)
    .map((r) => ({
      query: r.prep ? `${r.item}, ${r.prep}` : r.item,
      qty: r.quantity as number,
      unit: r.unit?.trim() || "g",
      // The audit trail should read like the plate, not like a database row.
      source: `${r.quantity} ${r.unit ?? ""} ${r.item}`.replace(/\s+/g, " ").trim(),
      structured: true,
      fdcId: r.fdc_id ?? null,
    }));
}

/**
 * Resolve a recipe's ingredient list into measured macros.
 *
 * The whole point of this module is that it adds no nutrition intelligence of its own:
 * it hands the ingredient text to the same pipeline the meal logger uses
 * (local model identifies the foods -> USDA FoodData Central supplies the grams and the
 * macros) and stores the totals. A recipe's macros are therefore measured, not recalled.
 *
 * Totals are for the recipe AS WRITTEN — the whole tray. Portions are NOT a property of a
 * recipe: you cook a pile of food and then eyeball it into however many containers you feel
 * like that day, and the same recipe splits 5 ways one week and 7 the next. The portion
 * count therefore lives on a `cook`, and per-portion macros are derived there.
 */

// Re-exported so this module stays the single import site for macro types and portion maths.
// The definitions live in the leaf module `recipe-portions.ts` because this file imports
// `./estimate` (USDA + Ollama), which the bundler-free unit test runner cannot resolve.
export type { RecipeMacroTotals, MacroKey } from "./recipe-portions";
export { perPortion, storedMacrosFor } from "./recipe-portions";

/** One resolved ingredient — the audit trail. A number you cannot audit is a number you
 *  cannot trust, and this is what makes the total checkable instead of hopeful. */
export interface ResolvedIngredient {
  input: string;
  matched: string;
  fdcId: number;
  grams: number;
  /** false when the text stated no amount and one was guessed. */
  quantified: boolean;
  /** How the grams were derived, e.g. "USDA portion: 1 cup = 195g". */
  basis: string;
}

export interface RecipeMacros {
  total: RecipeMacroTotals;
  /** Every ingredient, what USDA record it matched, and how its grams were arrived at. */
  items: ResolvedIngredient[];
  /** Ingredients with no stated amount. Non-empty means the total is soft — go fix the text. */
  unquantified: string[];
  /** Ingredients that matched no plausible USDA record and are ABSENT from the total. */
  unmatched: string[];
  /**
   * How many servings the ingredient list makes. LOAD-BEARING, not a hint: when this is >1 the
   * ingredient list is a batch, and it is the divisor used to persist recipes.calories as ONE
   * serving. It was documented as "a hint, not a claim" until 2026-08-13, and treating it as
   * decorative is what let two batch recipes store whole-cook macros against a per-meal reading.
   */
  typicalPortions: number | null;
  /** One serving — the figure persisted to recipes.calories. `total` remains the whole batch. */
  perPortion: Omit<RecipeMacroTotals, "confidence" | "notes"> | null;
}

/**
 * Recompute and persist a recipe's macros. Returns null if the recipe has no ingredient
 * text — that is a normal state (10 of the 19 seeded recipes are restaurant-style dishes
 * with no ingredient list) and not an error. Such recipes simply can't be meal-planned;
 * they are still loggable through the photo analyzer.
 */
export async function resolveRecipeMacros(
  db: SupabaseClient,
  userId: string,
  recipeId: string,
): Promise<RecipeMacros | null> {
  const { data: recipe, error } = await db
    .from("recipes")
    .select("id, name, ingredients, ingredients_json, typical_portions")
    .eq("id", recipeId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw new Error(`recipe load failed: ${error.message}`);
  if (!recipe) throw new Error("Recipe not found");

  const structured = asIngredientRows(recipe.ingredients_json);
  const ingredients = (recipe.ingredients as string | null)?.trim();
  if (!structured.length && !ingredients) return null;

  // STRUCTURED FIRST — and it is not merely a nicer input format.
  //
  // The prose path spends a model call recovering {food, amount} pairs out of a sentence, then
  // re-lexes every number back out of the source fragment because the model alters the ones it is
  // asked to repeat (parse.ts: a large egg read as 105 g against a real ~50 g). ingredients_json
  // already holds those pairs, so none of that machinery runs: no Ollama, no lexer, no rounding.
  // With fdc_id pinned, USDA search and the model's record selection are skipped too, which is
  // what makes a re-resolve next month return the same numbers as today.
  const estimate = structured.length
    ? await estimateFromStructured(toParsedFoods(structured), recipe.name as string)
    : // The recipe NAME is passed as the label, not as food to parse — naming the dish helps
      // the identifier disambiguate ("Greek Salmon" -> salmon, not a generic fish), while the
      // ingredient list remains the only thing quantities are read from.
      // "recipe" mode, NOT the meal prompt. A recipe's ingredients are raw and dry; the meal
      // prompt's examples all say "cooked", and fed a recipe it rewrote "2 cups dry brown rice"
      // to cooked rice — ~90g of carbs instead of ~280g, reported as HIGH confidence.
      await estimateFromText(ingredients as string, recipe.name as string, "recipe");

  const total: RecipeMacroTotals = {
    calories: Math.round(estimate.totals.calories),
    protein_g: Math.round(estimate.totals.protein_g * 10) / 10,
    carbs_g: Math.round(estimate.totals.carbs_g * 10) / 10,
    fat_g: Math.round(estimate.totals.fat_g * 10) / 10,
    fiber_g: Math.round(estimate.totals.fiber_g * 10) / 10,
    confidence: estimate.confidence,
    notes: estimate.notes,
  };

  // A recipe that resolves to no calories at all means USDA matched nothing usable.
  // Storing that would put an authoritative-looking zero on a real plate of food.
  if (total.calories <= 0) {
    throw new Error(
      `USDA matched no usable food in "${recipe.name}" — ingredients may be too vague to resolve`,
    );
  }

  const items: ResolvedIngredient[] = estimate.items.map((i) => ({
    input: i.input,
    matched: i.matched,
    fdcId: i.fdcId,
    grams: i.grams,
    quantified: i.quantified,
    basis: i.basis,
  }));
  const unquantified = items.filter((i) => !i.quantified).map((i) => i.input);

  // An ingredient that could not be quantified or matched is ABSENT from the total, so an
  // incomplete resolve silently understates a real plate — a 200g chicken thigh dropping out
  // took one recipe from ~40g protein to ~12g with nothing in the row to show for it. The
  // unmatched list was already persisted; the unquantified list was computed and thrown away,
  // which is exactly the trace that went missing. Persist both, and never let a total that is
  // known to be missing an ingredient read above "low".
  const incomplete = unquantified.length > 0 || estimate.unmatched.length > 0;
  if (incomplete) total.confidence = "low";

  // DELIBERATELY AMOUNT-LESS ROWS ARE NOT "UNQUANTIFIED", and conflating the two would be a
  // regression in both directions.
  //
  //   unquantified — an amount was needed, none was found, so one was INVENTED. The total is soft
  //                  and confidence must drop.
  //   amountless   — the author wrote `quantity: null`. "Salt, to taste" has no mass to add and
  //                  contributes nothing; excluding it leaves the total exactly right.
  //
  // Capping confidence on the second would make every recipe containing salt read "low" and train
  // Jason to ignore the badge. Dropping them without a trace would hide a genuinely forgotten
  // amount. So: persisted for audit, no effect on confidence.
  const amountless = structured
    .filter(
      (r) => typeof r.quantity !== "number" || !Number.isFinite(r.quantity) || r.quantity <= 0,
    )
    .map((r) => (r.prep ? `${r.item}, ${r.prep}` : r.item));

  // THE INGREDIENT LIST IS THE BATCH; THE STORED MACROS ARE ONE SERVING.
  //
  // `total` is the sum of the ingredient list, which for a batch recipe is the whole cook. Every
  // consumer of recipes.calories — the meals page, PlannedMealDetail, the "Ate this" button,
  // fetch_briefing_data.py — reads it as ONE meal, because that is the only reading that makes
  // sense on a planned plate. Persisting the batch total against that assumption is not a display
  // bug, it is a logging bug: "Ate this" writes the whole cook into meal_log for a single sitting.
  //
  // Two recipes were already doing exactly that when this was written — the tofu rice bowl
  // (typical_portions 2, stored 829 kcal) and the gochujang beef batch (3, stored 1783) — both
  // carrying whole-batch ingredient lists and a valid macros_computed_at, so both overlogged by
  // 2x and 3x on every use. Dividing here is what lets the ingredient list say "1 lb of beef,
  // serves 3" while the plate still says ~594 kcal.
  //
  // Divide on the way in rather than at each read: there are eight-odd consumers across TS and
  // Python, and one of them forgetting is a silent 2x in a health log. The batch figure is kept
  // in metadata so the division stays auditable and nothing is lost.
  const typicalPortions = (recipe.typical_portions as number | null) ?? null;
  const { portions, stored } = storedMacrosFor(total, typicalPortions);

  const { error: writeErr } = await db
    .from("recipes")
    .update({
      calories: stored.calories,
      protein_g: stored.protein_g,
      carbs_g: stored.carbs_g,
      fat_g: stored.fat_g,
      fiber_g: stored.fiber_g,
      macros_confidence: total.confidence,
      macros_computed_at: new Date().toISOString(),
      // Persist the working, not just the answer. Without this the only way to find out that
      // the rice had been resolved as COOKED was to reverse-engineer it from the carb count.
      metadata: {
        macro_items: items,
        macro_notes: total.notes,
        macro_unmatched: estimate.unmatched,
        macro_unquantified: unquantified,
        // Structured rows the author marked as having no amount. Empty on the prose path.
        macro_amountless: amountless,
        // Which path produced these numbers, so a re-resolve that changes a total can be
        // attributed rather than guessed at.
        macro_source: structured.length ? "structured" : "text",
        // What the ingredient list actually sums to, and what it was divided by. Without these
        // a stored 594 is indistinguishable from a recipe that genuinely holds 594 kcal of food,
        // and the /3 becomes unverifiable after the fact.
        macro_batch_total: portions > 1 ? total : null,
        macro_portions: portions,
      },
    })
    .eq("id", recipeId)
    .eq("user_id", userId);

  if (writeErr) throw new Error(`recipe macro write failed: ${writeErr.message}`);

  return {
    total,
    items,
    unquantified,
    unmatched: estimate.unmatched,
    typicalPortions,
    perPortion: typicalPortions ? perPortion(total, typicalPortions) : null,
  };
}
