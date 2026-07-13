import { createClient } from "@/lib/supabase/server";
import { estimateFromText } from "@/lib/nutrition/estimate";
import type { Macros } from "@/lib/nutrition/fdc";

/**
 * Text -> macros. Was: an Anthropic (claude-haiku) call that recalled nutrition
 * facts from memory. Now: the local model parses the text into foods + quantities,
 * and USDA FoodData Central supplies the measured macros (#476).
 *
 * More accurate than before, not less — the numbers are read from data rather
 * than recalled by a language model.
 */

export type MacroEstimate = {
  food_name: string;
  meal_type_guess: "breakfast" | "lunch" | "dinner" | "snack";
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g: number | null;
  sugar_g: number | null;
  sodium_mg: number;
  confidence: "high" | "medium" | "low";
  notes: string;
};

/** Local-clock meal guess. The old prompt asked the model to infer this; a clock is better. */
function mealTypeByHour(): MacroEstimate["meal_type_guess"] {
  const tz = process.env.USER_TIMEZONE || "America/Los_Angeles";
  const hour = Number(
    new Intl.DateTimeFormat("en-US", { hour: "numeric", hour12: false, timeZone: tz }).format(
      new Date(),
    ),
  );
  if (hour < 11) return "breakfast";
  if (hour < 15) return "lunch";
  if (hour < 21) return "dinner";
  return "snack";
}

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  let body: {
    ingredients: string;
    dish_name?: string;
    user_context?: string;
    current_macros?: Partial<Macros>;
  };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const ingredients = body.ingredients?.trim() ?? "";
  const dishName = body.dish_name?.trim() ?? "";
  if (!ingredients && !dishName) {
    return Response.json({ error: "ingredients or dish_name is required" }, { status: 400 });
  }

  const userContext = body.user_context?.trim() ?? "";
  if (userContext.length > 500) {
    return Response.json({ error: "user_context must be ≤ 500 characters" }, { status: 400 });
  }

  const cm = body.current_macros;
  const hasCurrent =
    !!cm && (cm.calories != null || cm.protein_g != null || cm.carbs_g != null || cm.fat_g != null);

  try {
    // Adjustment path ("added some chicken" on an already-logged meal): estimate
    // ONLY the addition, then add it to what's already there. The old prompt asked
    // the model to "return the NEW TOTAL" — i.e. to do arithmetic on macros it had
    // itself invented. Estimating the delta and summing it is exact.
    const estimate = await estimateFromText(ingredients || dishName, dishName || undefined);

    let calories = estimate.totals.calories;
    let protein_g = estimate.totals.protein_g;
    let carbs_g = estimate.totals.carbs_g;
    let fat_g = estimate.totals.fat_g;
    let fiber_g: number | null = estimate.totals.fiber_g;
    let sugar_g: number | null = estimate.totals.sugar_g;
    let sodium_mg = estimate.totals.sodium_mg;
    let notes = estimate.notes;

    if (hasCurrent && ingredients) {
      calories = Math.round((cm!.calories ?? 0) + calories);
      protein_g = Math.round(((cm!.protein_g ?? 0) + protein_g) * 10) / 10;
      carbs_g = Math.round(((cm!.carbs_g ?? 0) + carbs_g) * 10) / 10;
      fat_g = Math.round(((cm!.fat_g ?? 0) + fat_g) * 10) / 10;
      fiber_g =
        cm!.fiber_g != null ? Math.round((cm!.fiber_g + (fiber_g ?? 0)) * 10) / 10 : fiber_g;
      sugar_g =
        cm!.sugar_g != null ? Math.round((cm!.sugar_g + (sugar_g ?? 0)) * 10) / 10 : sugar_g;
      sodium_mg = Math.round((cm!.sodium_mg ?? 0) + sodium_mg);
      notes = `Added to the existing meal. ${estimate.notes}`;
    }

    if (estimate.items.length === 0) {
      return Response.json(
        { error: "Could not match any food to USDA data. Try naming the foods more plainly." },
        { status: 422 },
      );
    }

    const out: MacroEstimate & { items: typeof estimate.items } = {
      food_name: estimate.food_name,
      meal_type_guess: mealTypeByHour(),
      calories,
      protein_g,
      carbs_g,
      fat_g,
      fiber_g,
      sugar_g,
      sodium_mg,
      confidence: estimate.confidence,
      notes,
      // Per-food breakdown with the USDA entry actually used. The old route was a
      // black box; now the user can see WHY the number is what it is.
      items: estimate.items,
    };

    return Response.json(out);
  } catch (err) {
    console.error("[estimate-macros] failed:", err);
    return Response.json(
      { error: err instanceof Error ? err.message : "Estimation failed" },
      { status: 500 },
    );
  }
}
