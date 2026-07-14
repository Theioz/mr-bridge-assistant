import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { createCook, getLeftovers } from "@/lib/nutrition/cooks";

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
    return NextResponse.json({ cook });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to record cook";
    // Bad input (no macros on the recipe, no name, zero portions) is the user's to fix.
    const client = /no macros|not found|needs a name|portions|no usable food/i.test(msg);
    if (!client) console.error("[POST /api/cooks]", err);
    return NextResponse.json({ error: msg }, { status: client ? 400 : 500 });
  }
}
