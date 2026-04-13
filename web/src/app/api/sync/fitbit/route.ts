import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { syncFitbit } from "@/lib/sync/fitbit";

export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!process.env.FITBIT_CLIENT_ID || !process.env.FITBIT_CLIENT_SECRET) {
    return NextResponse.json({ skipped: true, reason: "Fitbit not configured" });
  }

  try {
    const db = createServiceClient();
    const result = await syncFitbit(db);
    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Sync failed";
    // Refresh token missing from profile table → treat as not configured, not an error
    if (msg.includes("not found in profile table")) {
      return NextResponse.json({ skipped: true, reason: "Fitbit refresh token not stored yet" });
    }
    console.error("[/api/sync/fitbit]", err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
