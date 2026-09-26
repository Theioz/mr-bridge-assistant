import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import {
  deletePackagedFood,
  parsePackagedFoodInput,
  PackagedFoodInputError,
  updatePackagedFood,
} from "@/lib/nutrition/packaged-foods";

/**
 * Replace a product's entry. The body is the WHOLE entry, panel included — see
 * `parsePackagedFoodInput` on why there is no partial update of a label.
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
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
    const food = await updatePackagedFood(db, user.id, id, parsePackagedFoodInput(body));
    return NextResponse.json({ food });
  } catch (err) {
    if (err instanceof PackagedFoodInputError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    console.error("[PATCH /api/packaged-foods/[id]]", err);
    const msg = err instanceof Error ? err.message : "Failed to update the product";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

/** Remove a product. Refused (409) while a recipe line still pins it. */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const db = createServiceClient();
    await deletePackagedFood(db, user.id, id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof PackagedFoodInputError) {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    console.error("[DELETE /api/packaged-foods/[id]]", err);
    const msg = err instanceof Error ? err.message : "Failed to remove the product";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
