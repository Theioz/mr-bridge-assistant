import type { SupabaseClient } from "@supabase/supabase-js";
import { freshUrl } from "../nutrition/grocery-list.ts";
import { gramsPerUnitFor } from "../nutrition/inventory-draw.ts";

/**
 * Bodies of the `plan_meals` and `pin_grocery_product` MCP tools (meals.ts).
 *
 * They live apart from the AI SDK tool wrappers so they can be contract-tested (#761): this
 * module has no `ai` or `@/` runtime import, so node's bundler-free test runner loads it
 * directly. meals.ts owns the descriptions and input schemas; behaviour is here.
 */

export interface PlanMealInput {
  date: string;
  meal_type: string;
  cook_id?: string;
  recipe_id?: string;
  name?: string;
  portions?: number;
  notes?: string;
}

export async function planMeals(supabase: SupabaseClient, userId: string, meals: PlanMealInput[]) {
  if (!userId) return { error: "No user context" };

  for (const m of meals) {
    if (m.cook_id && m.recipe_id) {
      return {
        error: `${m.date} ${m.meal_type}: pass cook_id OR recipe_id, not both — eating leftovers and cooking fresh are different days of work`,
      };
    }
    if (!m.cook_id && !m.recipe_id) {
      return {
        error: `${m.date} ${m.meal_type}: every planned meal must have a recipe_id or a cook_id — no freeform plans. For a meal out, use the "Eating out" recipe.`,
      };
    }
  }

  const rows = meals.map((m) => ({
    user_id: userId,
    date: m.date,
    meal_type: m.meal_type,
    cook_id: m.cook_id ?? null,
    recipe_id: m.recipe_id ?? null,
    name: m.name ?? null,
    portions: m.portions ?? 1,
    notes: m.notes ?? null,
    status: "planned",
    updated_at: new Date().toISOString(),
  }));

  const { data, error } = await supabase
    .from("meal_plans")
    .upsert(rows, { onConflict: "user_id,date,meal_type" })
    .select("id, date, meal_type");
  if (error) return { error: error.message };
  return { planned: data?.length ?? 0, meals: data ?? [] };
}

export interface PinGroceryProductInput {
  asin: string;
  title: string;
  fdc_id?: number;
  packaged_food_id?: string;
  pack_quantity?: number;
  pack_unit?: string;
  price_usd?: number;
  fresh?: boolean;
  notes?: string;
}

export async function pinGroceryProduct(
  supabase: SupabaseClient,
  userId: string,
  input: PinGroceryProductInput,
) {
  if (!userId) return { error: "No user context" };
  const asin = input.asin.trim().toUpperCase();
  if (!/^[A-Z0-9]{10}$/.test(asin)) return { error: `"${input.asin}" is not an ASIN` };
  if (input.fdc_id == null && !input.packaged_food_id) {
    return { error: "Pin to a food: pass fdc_id or packaged_food_id" };
  }

  let packGrams: number | null = null;
  if (input.pack_quantity != null) {
    const factor = gramsPerUnitFor(input.pack_unit ?? null);
    if (factor == null) {
      return { error: `"${input.pack_unit}" is not a weight unit (use g, kg, oz or lb)` };
    }
    packGrams = Math.round(input.pack_quantity * factor * 100) / 100;
  }

  // One pin per food: drop a different product already pinned to this identity first,
  // so re-pinning replaces rather than tripping the unique index.
  const identity = input.packaged_food_id
    ? { col: "packaged_food_id", val: input.packaged_food_id }
    : { col: "fdc_id", val: input.fdc_id };
  const { data: replaced, error: delErr } = await supabase
    .from("grocery_products")
    .delete()
    .eq("user_id", userId)
    .eq(identity.col, identity.val)
    .neq("asin", asin)
    .select("asin, title");
  if (delErr) return { error: delErr.message };

  const row = {
    user_id: userId,
    asin,
    title: input.title,
    pack_grams: packGrams,
    price_cents: input.price_usd != null ? Math.round(input.price_usd * 100) : null,
    price_seen_at: input.price_usd != null ? new Date().toISOString() : null,
    fresh: input.fresh ?? true,
    fdc_id: input.fdc_id ?? null,
    packaged_food_id: input.packaged_food_id ?? null,
    notes: input.notes ?? null,
  };
  const { data, error } = await supabase
    .from("grocery_products")
    .upsert(row, { onConflict: "user_id,asin" })
    .select("asin, title, pack_grams, price_cents, fdc_id, packaged_food_id")
    .single();
  if (error) return { error: error.message };
  return { pinned: data, url: freshUrl(asin), replaced: replaced ?? [] };
}
