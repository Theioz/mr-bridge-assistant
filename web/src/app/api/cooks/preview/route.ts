import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { planDraw } from "@/lib/nutrition/inventory-draw";

/**
 * "What would cooking this take out of the kitchen?" — READ ONLY.
 *
 * Backs the confirmation step on "Cooked it". Inventory has no second source of truth: if a
 * draw goes to the wrong row, nothing else in the app will ever contradict it, so the amounts
 * are shown before they are applied rather than reported after.
 *
 * The plan returned here is advisory. `POST /api/cooks` re-plans against fresh rows at apply
 * time and answers with what it actually drew — a row can change in the seconds between
 * looking and confirming, and the stored quantity must be the one that was true when written.
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { recipe_id?: string; portions?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.recipe_id) {
    return NextResponse.json({ error: "recipe_id is required" }, { status: 400 });
  }
  if (!body.portions || !Number.isInteger(body.portions) || body.portions < 1) {
    return NextResponse.json(
      { error: "portions must be a positive whole number" },
      { status: 400 },
    );
  }

  try {
    const db = createServiceClient();
    const plan = await planDraw(db, user.id, {
      recipeId: body.recipe_id,
      portionsCooked: body.portions,
    });
    return NextResponse.json({ plan });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to plan the draw";
    const client = /not found/i.test(msg);
    if (!client) console.error("[POST /api/cooks/preview]", err);
    return NextResponse.json({ error: msg }, { status: client ? 400 : 500 });
  }
}
