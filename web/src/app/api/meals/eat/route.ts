import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { eatFromCook } from "@/lib/nutrition/cooks";

/**
 * "I ate this." One tap: the macros are already known, so there is no photo, no local model
 * and no USDA round trip. Writes meal_log, draws the portion down off the cook, and marks
 * the plan satisfied if one was given.
 *
 * This route is the entire reason the cooks model exists. Every prepped meal previously cost
 * a photo -> parse -> USDA cycle; three of those a day is what made meal logging stop.
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: {
    cook_id?: string;
    portions?: number;
    meal_type?: string;
    date?: string;
    meal_plan_id?: string;
    notes?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.cook_id) {
    return NextResponse.json({ error: "cook_id is required" }, { status: 400 });
  }

  try {
    const db = createServiceClient();
    const result = await eatFromCook(db, user.id, {
      cookId: body.cook_id,
      portions: body.portions,
      mealType: body.meal_type,
      date: body.date,
      mealPlanId: body.meal_plan_id ?? null,
      notes: body.notes,
    });
    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to log meal";
    // "Only 1 portion left" is a normal thing for a user to hit, not a server fault.
    const client = /not found|portion|greater than zero/i.test(msg);
    if (!client) console.error("[POST /api/meals/eat]", err);
    return NextResponse.json({ error: msg }, { status: client ? 400 : 500 });
  }
}
