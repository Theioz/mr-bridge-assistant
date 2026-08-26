import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { createCook, getLeftovers } from "@/lib/nutrition/cooks";
import { planDraw, applyDraw } from "@/lib/nutrition/inventory-draw";

/** What's in the fridge: cooks with portions left, oldest first. */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const db = createServiceClient();
    return NextResponse.json({ leftovers: await getLeftovers(db, user.id) });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to load leftovers";
    console.error("[GET /api/cooks]", err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

/**
 * "I cooked this." Takes a recipe (macros copied from it) or an ingredient list (macros
 * resolved through USDA) plus how many containers it was split into. Never takes macros.
 *
 * With `draw_inventory`, this is also the moment raw ingredients leave the kitchen: cooking is
 * a transfer out of `inventory_items` and into `cooks`, not an event with a side effect. The
 * draw is re-planned here against fresh rows rather than taking the client's previewed plan —
 * the preview is advisory, and a row can change between looking and confirming.
 *
 * A failed draw never fails the cook. The food came out of the fridge whichever way the
 * bookkeeping went, so the cook is recorded and the draw's outcome is reported alongside it.
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: {
    recipe_id?: string;
    name?: string;
    ingredients?: string;
    portions?: number;
    cooked_on?: string;
    notes?: string;
    draw_inventory?: boolean;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.portions) {
    return NextResponse.json(
      { error: "portions is required — how many containers did it make?" },
      { status: 400 },
    );
  }

  try {
    const db = createServiceClient();
    const cook = await createCook(db, user.id, {
      recipeId: body.recipe_id ?? null,
      name: body.name,
      ingredients: body.ingredients,
      portions: body.portions,
      cookedOn: body.cooked_on,
      notes: body.notes,
    });

    if (!body.draw_inventory || !body.recipe_id) return NextResponse.json({ cook });

    try {
      const plan = await planDraw(db, user.id, {
        recipeId: body.recipe_id,
        portionsCooked: body.portions,
      });
      const { applied, failed } = await applyDraw(db, user.id, cook.id, plan);
      return NextResponse.json({ cook, draw: { applied, skipped: plan.skips, failed } });
    } catch (drawErr) {
      // The cook is already written and is the record that matters. Surface the draw failure
      // instead of rolling back a true statement about what was cooked.
      console.error("[POST /api/cooks] inventory draw failed", drawErr);
      const msg = drawErr instanceof Error ? drawErr.message : "inventory draw failed";
      return NextResponse.json({
        cook,
        draw: { applied: [], skipped: [], failed: [], error: msg },
      });
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to record cook";
    // Bad input (no macros on the recipe, no name, zero portions) is the user's to fix.
    const client = /no macros|not found|needs a name|portions|no usable food/i.test(msg);
    if (!client) console.error("[POST /api/cooks]", err);
    return NextResponse.json({ error: msg }, { status: client ? 400 : 500 });
  }
}
