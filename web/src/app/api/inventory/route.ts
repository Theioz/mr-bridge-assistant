import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { createItem, listInventory } from "@/lib/nutrition/inventory";

/** What's in the kitchen: raw ingredients on hand, by location, soonest-to-expire first. */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const db = createServiceClient();
    return NextResponse.json({ items: await listInventory(db, user.id) });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to load inventory";
    console.error("[GET /api/inventory]", err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

/** Add an item to the kitchen. Name is required; everything else is optional. */
export async function POST(req: NextRequest) {
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
    const item = await createItem(db, user.id, body);
    return NextResponse.json({ item });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to add item";
    // Bad input (no name, bad quantity/location) is the user's to fix.
    const client = /needs a name|must be|cannot be blank|location/i.test(msg);
    if (!client) console.error("[POST /api/inventory]", err);
    return NextResponse.json({ error: msg }, { status: client ? 400 : 500 });
  }
}
