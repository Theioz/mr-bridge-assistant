/**
 * Meal suggestions without an LLM inventing nutrition numbers.
 *
 * Three jobs, split by what each thing is actually good at:
 *
 *   1. MATCH saved recipes   — deterministic. Ingredient overlap with what's on
 *                              hand. No model needed; the user's own library is
 *                              the best source of "what do I actually cook".
 *   2. PROPOSE new dishes    — the one genuinely creative bit. The local model
 *                              suggests a dish + its ingredient list. It is NOT
 *                              asked for macros.
 *   3. QUANTIFY              — USDA, via the same pipeline as everything else.
 *
 * The old route asked Claude to do all three at once, including inventing the
 * calorie counts. Here the numbers are computed from the ingredient list, so a
 * suggestion's macros are consistent with what you'd get if you actually logged it.
 */
import { estimateFromText } from "./estimate";
import { chatJSON } from "./parse";

export type SavedRecipe = {
  id: string;
  name: string;
  cuisine?: string | null;
  ingredients?: string | null;
  tags?: string[] | null;
};

export type Suggestion = {
  name: string;
  description: string;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  isSaved: boolean;
  recipeId?: string;
};

export type MacroBudget = {
  calories: number | null;
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
};

/** Tokenise an ingredient blob into comparable words. */
function tokens(s: string): Set<string> {
  return new Set(
    (s || "")
      .toLowerCase()
      .split(/[^a-z]+/)
      .filter((w) => w.length > 2 && !STOPWORDS.has(w)),
  );
}

const STOPWORDS = new Set([
  "and",
  "the",
  "with",
  "for",
  "cup",
  "cups",
  "tbsp",
  "tsp",
  "oz",
  "lb",
  "grams",
  "gram",
  "chopped",
  "diced",
  "sliced",
  "fresh",
  "large",
  "small",
  "medium",
  "optional",
  "taste",
]);

/**
 * How well does a saved recipe match what's in the fridge?
 * Fraction of the recipe's ingredients the user already has — so a 3-ingredient
 * recipe you can fully make beats a 12-ingredient one you're missing half of.
 */
function overlapScore(recipe: SavedRecipe, onHand: Set<string>): number {
  const need = tokens(`${recipe.ingredients ?? ""} ${recipe.name}`);
  if (need.size === 0) return 0;
  let hit = 0;
  for (const t of need) if (onHand.has(t)) hit++;
  return hit / need.size;
}

/** Distance from the remaining budget — lower is better. Null goals don't count. */
function budgetFit(m: { calories: number; protein_g: number }, budget: MacroBudget): number {
  let d = 0;
  if (budget.calories != null) d += Math.abs(m.calories - budget.calories) / 500;
  if (budget.protein_g != null) d += Math.abs(m.protein_g - budget.protein_g) / 40;
  return d;
}

const PROPOSE_SCHEMA = {
  type: "object",
  properties: {
    dishes: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          description: { type: "string" },
          ingredients: { type: "string" },
        },
        required: ["name", "description", "ingredients"],
      },
    },
  },
  required: ["dishes"],
};

/**
 * Ask the local model for dish IDEAS only — never for numbers.
 *
 * `ingredients` must come back as a plain quantified list ("6oz chicken breast,
 * 1 cup rice"), because that string is fed straight into the USDA pipeline to
 * compute the macros. The model is writing a shopping list, not a nutrition label.
 */
async function proposeDishes(
  onHand: string,
  budget: MacroBudget,
  dietary: string,
  count: number,
): Promise<{ name: string; description: string; ingredients: string }[]> {
  if (count <= 0) return [];

  const budgetLine =
    budget.calories != null
      ? `They have about ${budget.calories} kcal and ${budget.protein_g ?? "?"}g protein left today.`
      : "No calorie goal set.";

  const out = await chatJSON<{
    dishes: { name: string; description: string; ingredients: string }[];
  }>(
    [
      {
        role: "system",
        content: [
          "Suggest meals someone can cook right now from the ingredients they have.",
          "",
          "For each dish give:",
          "- name: the dish",
          "- description: one or two sentences — how it's cooked and why it fits",
          "- ingredients: a QUANTIFIED list, e.g. '6 oz chicken breast, 1 cup white rice,",
          "  1 cup broccoli, 1 tbsp olive oil'. Use plain ingredient names and real units.",
          "",
          "Do NOT output calories or macros. Those are computed from your ingredient list,",
          "so the list must be realistic and quantified.",
        ].join("\n"),
      },
      {
        role: "user",
        content: [
          `Ingredients on hand: ${onHand}`,
          budgetLine,
          dietary ? `Dietary preferences: ${dietary}` : "",
          `Suggest ${count} dish(es).`,
        ]
          .filter(Boolean)
          .join("\n"),
      },
    ],
    PROPOSE_SCHEMA,
    120_000,
  );

  return (out.dishes ?? []).slice(0, count);
}

export async function suggestMeals(opts: {
  ingredients: string;
  budget: MacroBudget;
  savedRecipes: SavedRecipe[];
  dietary: string;
  limit?: number;
}): Promise<Suggestion[]> {
  const limit = opts.limit ?? 3;
  const onHand = tokens(opts.ingredients);

  // 1. Saved recipes the user can actually make right now, best match first.
  const ranked = opts.savedRecipes
    .map((r) => ({ r, score: overlapScore(r, onHand) }))
    .filter((x) => x.score > 0.15) // needs meaningful overlap, not one shared word
    .sort((a, b) => b.score - a.score)
    .slice(0, 2);

  // 2. Top up with fresh ideas from the local model.
  const proposals = await proposeDishes(
    opts.ingredients,
    opts.budget,
    opts.dietary,
    Math.max(0, limit - ranked.length),
  ).catch(() => []);

  // 3. Quantify everything through USDA — same pipeline as logging, so a
  //    suggestion's macros match what you'd get if you actually ate it.
  const saved: Suggestion[] = (
    await Promise.all(
      ranked.map(async ({ r }): Promise<Suggestion | null> => {
        const est = await estimateFromText(r.ingredients ?? r.name, r.name).catch(() => null);
        if (!est || est.items.length === 0) return null;
        return {
          name: r.name,
          description:
            `From your saved recipes${r.cuisine ? ` (${r.cuisine})` : ""}. ` +
            `You have most of the ingredients.`,
          calories: est.totals.calories,
          protein_g: est.totals.protein_g,
          carbs_g: est.totals.carbs_g,
          fat_g: est.totals.fat_g,
          isSaved: true,
          recipeId: r.id,
        };
      }),
    )
  ).filter((s): s is Suggestion => s !== null);

  const fresh: Suggestion[] = (
    await Promise.all(
      proposals.map(async (p): Promise<Suggestion | null> => {
        const est = await estimateFromText(p.ingredients, p.name).catch(() => null);
        if (!est || est.items.length === 0) return null;
        return {
          name: p.name,
          description: p.description,
          calories: est.totals.calories,
          protein_g: est.totals.protein_g,
          carbs_g: est.totals.carbs_g,
          fat_g: est.totals.fat_g,
          isSaved: false,
        };
      }),
    )
  ).filter((s): s is Suggestion => s !== null);

  // Closest to the remaining budget first.
  return [...saved, ...fresh]
    .sort((a, b) => budgetFit(a, opts.budget) - budgetFit(b, opts.budget))
    .slice(0, limit);
}
