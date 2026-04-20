import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { syncGoogleFit } from "@/lib/sync/googlefit";
import { loadIntegration } from "@/lib/integrations/tokens";

export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = createServiceClient();

  const integration = await loadIntegration(db, user.id, "google").catch(() => null);
  if (!integration) {
    return NextResponse.json({ skipped: true, reason: "Google account not connected" });
  }

  try {
    const result = await syncGoogleFit(db, user.id);
    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    console.error("[/api/sync/googlefit]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Sync failed" },
      { status: 500 },
    );
  }
}
