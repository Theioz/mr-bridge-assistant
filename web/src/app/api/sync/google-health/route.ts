import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { syncGoogleHealth } from "@/lib/sync/google-health";

export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    return NextResponse.json({ skipped: true, reason: "Google Health not configured" });
  }

  try {
    const db = createServiceClient();
    const result = await syncGoogleHealth(db, user.id);
    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Sync failed";
    // User hasn't connected Google Health yet — treat as skipped, not an error
    if (msg.includes("not connected")) {
      return NextResponse.json({ skipped: true, reason: "Google Health not connected" });
    }
    console.error("[/api/sync/google-health]", err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
