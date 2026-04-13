import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { syncOura } from "@/lib/sync/oura";

export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!process.env.OURA_ACCESS_TOKEN) {
    return NextResponse.json({ skipped: true, reason: "OURA_ACCESS_TOKEN not configured" });
  }

  try {
    const db = createServiceClient();
    const result = await syncOura(db, user.id);
    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    console.error("[/api/sync/oura]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Sync failed" },
      { status: 500 },
    );
  }
}
