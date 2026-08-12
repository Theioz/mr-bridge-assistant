import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { resolveRecipeMacros } from "@/lib/nutrition/recipe-macros";
import {
  RecipeShapeError,
  parseIngredientRows,
  parseStepRows,
} from "@/lib/nutrition/recipe-structured";

/**
 * Edit a recipe — the write side of the structured editor.
 *
 * Only the fields present in the body are touched, so the editor can save an ingredient list
 * without having to round-trip (and risk clobbering) the name, tags or macros.
 *
 * Editing ingredients invalidates the macros by definition: the stored totals describe the OLD
 * list. Leaving them in place would leave a plate of food wearing yesterday's numbers, which is
 * the exact failure the macro audit trail exists to prevent — so a change to either ingredient
 * column triggers a re-resolve, and if that fails the macros are cleared rather than left stale.
 */
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: {
    name?: string;
    cuisine?: string | null;
    ingredients?: string | null;
    instructions?: string | null;
    ingredients_json?: unknown;
    steps_json?: unknown;
    tags?: string[] | null;
    typical_portions?: number | null;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const patch: Record<string, unknown> = {};
  let touchedIngredients = false;

  if ("name" in body) {
    const name = body.name?.trim();
    if (!name) return NextResponse.json({ error: "name cannot be empty" }, { status: 400 });
    patch.name = name;
  }
  if ("cuisine" in body) patch.cuisine = body.cuisine?.trim() || null;
  if ("tags" in body) patch.tags = body.tags ?? null;
  if ("instructions" in body) patch.instructions = body.instructions?.trim() || null;
  if ("typical_portions" in body) {
    const tp = body.typical_portions;
    if (tp != null && (!Number.isInteger(tp) || tp < 1))
      return NextResponse.json(
        { error: "typical_portions must be a positive integer or null" },
        { status: 400 },
      );
    patch.typical_portions = tp ?? null;
  }

  try {
    if ("ingredients_json" in body) {
      patch.ingredients_json = parseIngredientRows(body.ingredients_json);
      touchedIngredients = true;
    }
    if ("steps_json" in body) patch.steps_json = parseStepRows(body.steps_json);
  } catch (e) {
    if (e instanceof RecipeShapeError)
      return NextResponse.json({ error: e.message }, { status: 400 });
    throw e;
  }
  if ("ingredients" in body) {
    patch.ingredients = body.ingredients?.trim() || null;
    touchedIngredients = true;
  }

  if (!Object.keys(patch).length)
    return NextResponse.json({ error: "nothing to update" }, { status: 400 });

  try {
    const db = createServiceClient();
    const { data: recipe, error } = await db
      .from("recipes")
      .update(patch)
      .eq("id", id)
      .eq("user_id", user.id)
      .select("id, name")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!recipe) return NextResponse.json({ error: "Recipe not found" }, { status: 404 });

    let macrosResolved = false;
    let macrosError: string | null = null;
    if (touchedIngredients) {
      try {
        const resolved = await resolveRecipeMacros(db, user.id, id);
        macrosResolved = resolved !== null;
      } catch (e) {
        macrosError = e instanceof Error ? e.message : "Could not resolve macros";
        // Stale macros are worse than absent ones: absent shows "not resolved yet", stale shows a
        // confident number for food that is no longer the recipe.
        await db
          .from("recipes")
          .update({ macros_confidence: null, macros_computed_at: null })
          .eq("id", id)
          .eq("user_id", user.id);
      }
    }

    return NextResponse.json({ recipe, macrosResolved, macrosError });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to update recipe";
    console.error("[PATCH /api/recipes/[id]]", err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
