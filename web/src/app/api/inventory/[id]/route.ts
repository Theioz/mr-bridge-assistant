import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { deleteItem, updateItem } from "@/lib/nutrition/inventory";

/**
 * Edit an item: draw its quantity down as it's used, move it fridge->freezer when frozen,
 * fix an expiry or a note. Only the supplied fields change.
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  try {
    const db = createServiceClient();
    const item = await updateItem(db, user.id, id, body);
    return NextResponse.json({ item });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to update item";
    const client = /not found|must be|cannot be blank|location/i.test(msg);
    if (!client) console.error("[PATCH /api/inventory/[id]]", err);
    return NextResponse.json({ error: msg }, { status: client ? 400 : 500 });
  }
}

/** Used up or tossed — remove it. */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const db = createServiceClient();
    await deleteItem(db, user.id, id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to remove item";
    console.error("[DELETE /api/inventory/[id]]", err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
