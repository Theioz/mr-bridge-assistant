import type { SupabaseClient } from "@supabase/supabase-js";
import { estimateFromText } from "./estimate";

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

export interface RecipeMacroTotals {
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g: number;
  confidence: "high" | "medium" | "low";
  notes: string;
}

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
  /** Hint only — what a portion would look like IF split this many ways. Not a claim. */
  typicalPortions: number | null;
  perPortion: Omit<RecipeMacroTotals, "confidence" | "notes"> | null;
}

export function perPortion(
  total: Pick<RecipeMacroTotals, "calories" | "protein_g" | "carbs_g" | "fat_g" | "fiber_g">,
  portions: number,
) {
  const div = (n: number) => Math.round((n / portions) * 10) / 10;
  return {
    calories: Math.round(total.calories / portions),
    protein_g: div(total.protein_g),
    carbs_g: div(total.carbs_g),
    fat_g: div(total.fat_g),
    fiber_g: div(total.fiber_g),
  };
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
    .select("id, name, ingredients, typical_portions")
    .eq("id", recipeId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw new Error(`recipe load failed: ${error.message}`);
  if (!recipe) throw new Error("Recipe not found");

  const ingredients = (recipe.ingredients as string | null)?.trim();
  if (!ingredients) return null;

  // The recipe NAME is passed as the label, not as food to parse — naming the dish helps
  // the identifier disambiguate ("Greek Salmon" -> salmon, not a generic fish), while the
  // ingredient list remains the only thing quantities are read from.
  // "recipe" mode, NOT the meal prompt. A recipe's ingredients are raw and dry; the meal
  // prompt's examples all say "cooked", and fed a recipe it rewrote "2 cups dry brown rice"
  // to cooked rice — ~90g of carbs instead of ~280g, reported as HIGH confidence.
  const estimate = await estimateFromText(ingredients, recipe.name as string, "recipe");

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

  const { error: writeErr } = await db
    .from("recipes")
    .update({
      calories: total.calories,
      protein_g: total.protein_g,
      carbs_g: total.carbs_g,
      fat_g: total.fat_g,
      fiber_g: total.fiber_g,
      macros_confidence: total.confidence,
      macros_computed_at: new Date().toISOString(),
      // Persist the working, not just the answer. Without this the only way to find out that
      // the rice had been resolved as COOKED was to reverse-engineer it from the carb count.
      metadata: { macro_items: items, macro_notes: total.notes },
    })
    .eq("id", recipeId)
    .eq("user_id", userId);

  if (writeErr) throw new Error(`recipe macro write failed: ${writeErr.message}`);

  const typicalPortions = (recipe.typical_portions as number | null) ?? null;
  return {
    total,
    items,
    unquantified,
    typicalPortions,
    perPortion: typicalPortions ? perPortion(total, typicalPortions) : null,
  };
}
