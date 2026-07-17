import type { SupabaseClient } from "@supabase/supabase-js";
import { estimateFromText } from "./estimate";
import { perPortion } from "./recipe-macros";

/**
 * A cook is one time the user actually made food.
 *
 * Portions live here rather than on the recipe: you do not cook "the 6-serving chicken
 * bowl", you cook a pile of chicken and then eyeball it into however many containers you
 * feel like that day. The eyeball is the error bar on every macro downstream — these
 * numbers are for direction across weeks, not lab-grade accuracy.
 *
 * No function in this module accepts a macro value from its caller. Macros are either
 * snapshotted from a recipe (already USDA-derived) or resolved through the USDA pipeline
 * for an ad-hoc cook. There is nowhere for a model to write a nutrition number.
 */

export interface CookRow {
  id: string;
  name: string;
  cooked_on: string;
  portions: number;
  portions_remaining: number;
  calories: number | null;
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
  fiber_g: number | null;
  recipe_id: string | null;
}

interface Totals {
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g: number;
}

/**
 * Record that food was made.
 *
 * From a recipe: macros are COPIED from it, not joined. Editing a recipe next month must
 * not retroactively rewrite the nutrition of food already eaten.
 *
 * Ad hoc (no recipe — leftover ingredients thrown together): the ingredient text goes
 * through the same USDA pipeline the meal logger uses. Still not model-authored.
 */
export async function createCook(
  db: SupabaseClient,
  userId: string,
  input: {
    recipeId?: string | null;
    name?: string;
    ingredients?: string;
    portions: number;
    cookedOn?: string;
    notes?: string;
  },
): Promise<CookRow> {
  if (!Number.isInteger(input.portions) || input.portions < 1) {
    throw new Error("portions must be a positive whole number");
  }

  let name = input.name?.trim() ?? "";
  let totals: Totals | null = null;

  if (input.recipeId) {
    const { data: recipe, error } = await db
      .from("recipes")
      .select("id, name, calories, protein_g, carbs_g, fat_g, fiber_g, macros_computed_at")
      .eq("id", input.recipeId)
      .eq("user_id", userId)
      .maybeSingle();
    if (error) throw new Error(`recipe load failed: ${error.message}`);
    if (!recipe) throw new Error("Recipe not found");

    if (!recipe.macros_computed_at) {
      throw new Error(
        `"${recipe.name}" has no macros yet — resolve them first (POST /api/recipes/${input.recipeId}/macros)`,
      );
    }

    name = name || (recipe.name as string);
    totals = {
      calories: recipe.calories as number,
      protein_g: Number(recipe.protein_g),
      carbs_g: Number(recipe.carbs_g),
      fat_g: Number(recipe.fat_g),
      fiber_g: Number(recipe.fiber_g),
    };
  } else if (input.ingredients?.trim()) {
    // Ad-hoc cook — resolve its own macros through USDA, same as a recipe would.
    const est = await estimateFromText(input.ingredients, name || undefined);
    if (est.totals.calories <= 0) {
      throw new Error("USDA matched no usable food in those ingredients");
    }
    name = name || est.food_name;
    totals = {
      calories: Math.round(est.totals.calories),
      protein_g: Math.round(est.totals.protein_g * 10) / 10,
      carbs_g: Math.round(est.totals.carbs_g * 10) / 10,
      fat_g: Math.round(est.totals.fat_g * 10) / 10,
      fiber_g: Math.round(est.totals.fiber_g * 10) / 10,
    };
  }

  if (!name) throw new Error("A cook needs a name, a recipe, or an ingredient list");

  const { data, error } = await db
    .from("cooks")
    .insert({
      user_id: userId,
      recipe_id: input.recipeId ?? null,
      name,
      cooked_on: input.cookedOn ?? new Date().toISOString().slice(0, 10),
      portions: input.portions,
      portions_remaining: input.portions,
      notes: input.notes ?? null,
      ...(totals ?? {}),
    })
    .select()
    .single();

  if (error) throw new Error(`cook insert failed: ${error.message}`);
  return data as CookRow;
}

/**
 * What is in the fridge right now — the cooks with portions left.
 *
 * This is the query the weekly planner should run FIRST: food that already exists costs no
 * shopping and no cooking, and proposing a grocery run while a tray of turkey pasta goes off
 * is the fastest way to make a meal plan feel stupid.
 */
export async function getLeftovers(db: SupabaseClient, userId: string): Promise<CookRow[]> {
  const { data, error } = await db
    .from("cooks")
    .select(
      "id, name, cooked_on, portions, portions_remaining, calories, protein_g, carbs_g, fat_g, fiber_g, recipe_id",
    )
    .eq("user_id", userId)
    .gt("portions_remaining", 0)
    .order("cooked_on", { ascending: true }); // oldest first — eat it before it turns

  if (error) throw new Error(`leftovers query failed: ${error.message}`);
  return (data ?? []) as CookRow[];
}

/**
 * Eat a portion of a cook: write the meal, draw down the fridge.
 *
 * This is the whole point of the model. Logging a prepped meal becomes a CONFIRM — the
 * macros are already known — rather than a photo -> local model -> USDA round trip. That
 * round trip, three times a day, is the friction that killed meal logging in May.
 *
 * Not idempotent by design: eating two containers is two calls.
 */
export async function eatFromCook(
  db: SupabaseClient,
  userId: string,
  input: {
    cookId: string;
    portions?: number;
    mealType?: string;
    date?: string;
    mealPlanId?: string | null;
    notes?: string;
  },
): Promise<{ mealLogId: string; portionsRemaining: number; macros: Totals }> {
  const portions = input.portions ?? 1;
  if (!(portions > 0)) throw new Error("portions must be greater than zero");

  const { data: cook, error } = await db
    .from("cooks")
    .select("id, name, portions, portions_remaining, calories, protein_g, carbs_g, fat_g, fiber_g")
    .eq("id", input.cookId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(`cook load failed: ${error.message}`);
  if (!cook) throw new Error("Cook not found");

  if (Number(cook.portions_remaining) < portions) {
    throw new Error(
      `Only ${cook.portions_remaining} portion(s) of "${cook.name}" left — cannot eat ${portions}`,
    );
  }

  const totalsOfCook: Totals = {
    calories: (cook.calories as number) ?? 0,
    protein_g: Number(cook.protein_g ?? 0),
    carbs_g: Number(cook.carbs_g ?? 0),
    fat_g: Number(cook.fat_g ?? 0),
    fiber_g: Number(cook.fiber_g ?? 0),
  };

  // One portion's worth, times however many portions were eaten.
  const one = perPortion(totalsOfCook, cook.portions as number);
  const macros: Totals = {
    calories: Math.round(one.calories * portions),
    protein_g: Math.round(one.protein_g * portions * 10) / 10,
    carbs_g: Math.round(one.carbs_g * portions * 10) / 10,
    fat_g: Math.round(one.fat_g * portions * 10) / 10,
    fiber_g: Math.round(one.fiber_g * portions * 10) / 10,
  };

  const { data: logged, error: logErr } = await db
    .from("meal_log")
    .insert({
      user_id: userId,
      date: input.date ?? new Date().toISOString().slice(0, 10),
      meal_type: input.mealType ?? null,
      cook_id: cook.id,
      meal_plan_id: input.mealPlanId ?? null,
      portions,
      notes: input.notes ?? null,
      ...macros,
    })
    .select("id")
    .single();
  if (logErr) throw new Error(`meal_log insert failed: ${logErr.message}`);

  const remaining = Number(cook.portions_remaining) - portions;
  const { error: drawErr } = await db
    .from("cooks")
    .update({ portions_remaining: remaining })
    .eq("id", cook.id)
    .eq("user_id", userId);
  if (drawErr) throw new Error(`cook drawdown failed: ${drawErr.message}`);

  if (input.mealPlanId) {
    await db
      .from("meal_plans")
      .update({ status: "eaten", updated_at: new Date().toISOString() })
      .eq("id", input.mealPlanId)
      .eq("user_id", userId);
  }

  return { mealLogId: logged.id as string, portionsRemaining: remaining, macros };
}

/**
 * Eat a recipe-backed planned meal: make the recipe, then eat a portion of it.
 *
 * A recipe-backed plan means "cook this", so the honest record is a cook (the tray you made)
 * plus a meal_log (the serving you ate), with any surplus becoming leftovers the planner can
 * spend later. That is exactly createCook followed by eatFromCook — this only ties the two
 * together so one tap does both, which is what makes a recipe-backed plan loggable at all.
 * Before this, "Ate it" on such a plan flipped its status and logged NO macros, so a day of
 * eating to plan looked identical in the totals to a day of eating nothing.
 *
 * portionsCooked defaults to the recipe's typical_portions hint, or 1 when it has none — a
 * single-serving dish, or "no idea yet", where 1 is the honest floor (a real batch is still
 * best logged as a cook directly, with its true portion count). createCook enforces that the
 * recipe has resolved macros and throws a message pointing at the resolve endpoint otherwise.
 */
export async function eatFromRecipe(
  db: SupabaseClient,
  userId: string,
  input: {
    recipeId: string;
    portionsCooked?: number;
    portionsEaten?: number;
    mealType?: string;
    date?: string;
    mealPlanId?: string | null;
    notes?: string;
  },
): Promise<{ mealLogId: string; portionsRemaining: number; macros: Totals; cookId: string }> {
  const { data: recipe, error } = await db
    .from("recipes")
    .select("typical_portions")
    .eq("id", input.recipeId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(`recipe load failed: ${error.message}`);
  if (!recipe) throw new Error("Recipe not found");

  const portionsCooked = input.portionsCooked ?? (recipe.typical_portions as number | null) ?? 1;

  const cook = await createCook(db, userId, {
    recipeId: input.recipeId,
    portions: portionsCooked,
    cookedOn: input.date,
  });

  const eaten = await eatFromCook(db, userId, {
    cookId: cook.id,
    portions: input.portionsEaten ?? 1,
    mealType: input.mealType,
    date: input.date,
    mealPlanId: input.mealPlanId,
    notes: input.notes,
  });

  return { ...eaten, cookId: cook.id };
}
