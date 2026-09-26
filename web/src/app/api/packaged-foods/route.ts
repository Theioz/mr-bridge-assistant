import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import {
  createPackagedFood,
  listPackagedFoods,
  parsePackagedFoodInput,
  PackagedFoodInputError,
} from "@/lib/nutrition/packaged-foods";

/** The label catalog: every packaged product this kitchen buys, brand then product. */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const db = createServiceClient();
    return NextResponse.json({ foods: await listPackagedFoods(db, user.id) });
  } catch (err) {
    console.error("[GET /api/packaged-foods]", err);
    const msg = err instanceof Error ? err.message : "Failed to load the catalog";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

/** Add a product from its printed panel (per serving). Stored per 100 g. */
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  try {
    const db = createServiceClient();
    const food = await createPackagedFood(db, user.id, parsePackagedFoodInput(body));
    return NextResponse.json({ food }, { status: 201 });
  } catch (err) {
    if (err instanceof PackagedFoodInputError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    console.error("[POST /api/packaged-foods]", err);
    const msg = err instanceof Error ? err.message : "Failed to add the product";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
