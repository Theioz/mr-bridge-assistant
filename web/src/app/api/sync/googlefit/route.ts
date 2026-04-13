import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { syncGoogleFit } from "@/lib/sync/googlefit";

export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const hasGoogleFitConfig =
    !!(process.env.GOOGLE_FIT_CLIENT_ID ?? process.env.GOOGLE_CLIENT_ID) &&
    !!(process.env.GOOGLE_FIT_CLIENT_SECRET ?? process.env.GOOGLE_CLIENT_SECRET) &&
    !!(process.env.GOOGLE_FIT_REFRESH_TOKEN ?? process.env.GOOGLE_REFRESH_TOKEN);

  if (!hasGoogleFitConfig) {
    return NextResponse.json({ skipped: true, reason: "Google Fit not configured" });
  }

  try {
    const db = createServiceClient();
    const result = await syncGoogleFit(db);
    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    console.error("[/api/sync/googlefit]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Sync failed" },
      { status: 500 },
    );
  }
}
