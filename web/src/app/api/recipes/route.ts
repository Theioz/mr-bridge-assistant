import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { resolveRecipeMacros } from "@/lib/nutrition/recipe-macros";

/**
 * Create a recipe — and, when asked, resolve its macros and adopt a planned meal in one call.
 *
 * This is the "turn a freeform plan into a real recipe" path. A plan like "Tilapia x2 + rice"
 * carries no amounts and no macros: it's just text, so nothing can say how much tilapia or how
 * much rice. Writing the amounts once as a recipe fixes that permanently — the recipe owns
 * USDA-derived macros, and the plan that points at it becomes one-tap loggable.
 *
 * `resolve` runs the ingredient text through the same USDA pipeline the meal logger uses
 * (local model identifies foods, USDA supplies grams). It can fail on ingredients too vague to
 * match — that is not fatal here: the recipe is still saved with its text, just without macros,
 * and the caller is told so it can ask the user to tighten the amounts.
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: {
    name?: string;
    ingredients?: string;
    instructions?: string;
    tags?: string[];
    resolve?: boolean;
    link_plan_id?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const name = body.name?.trim();
  if (!name) return NextResponse.json({ error: "name is required" }, { status: 400 });
  const ingredients = body.ingredients?.trim() || null;

  try {
    const db = createServiceClient();
    const { data: recipe, error } = await db
      .from("recipes")
      .insert({
        user_id: user.id,
        name,
        ingredients,
        instructions: body.instructions?.trim() || null,
        tags: body.tags ?? null,
      })
      .select("id, name")
      .single();
    if (error) throw new Error(error.message);

    // Resolve macros if asked and there is ingredient text to resolve. A failure here leaves
    // the recipe intact (text saved, macros null) rather than losing the user's input.
    let macrosResolved = false;
    let macrosError: string | null = null;
    if (body.resolve && ingredients) {
      try {
        await resolveRecipeMacros(db, user.id, recipe.id);
        macrosResolved = true;
      } catch (e) {
        macrosError = e instanceof Error ? e.message : "Could not resolve macros";
      }
    }

    // Adopt a planned meal, if one was named. Guard the one-source rule: a plan already backed
    // by a cook (leftovers) must not also point at a recipe.
    if (body.link_plan_id) {
      const { error: linkErr } = await db
        .from("meal_plans")
        .update({ recipe_id: recipe.id, updated_at: new Date().toISOString() })
        .eq("id", body.link_plan_id)
        .eq("user_id", user.id)
        .is("cook_id", null);
      if (linkErr) throw new Error(`recipe saved, but linking the plan failed: ${linkErr.message}`);
    }

    return NextResponse.json({ recipe, macrosResolved, macrosError });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to create recipe";
    console.error("[POST /api/recipes]", err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
