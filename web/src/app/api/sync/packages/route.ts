import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { syncPackages } from "@/lib/sync/packages";
import { GoogleNotConnectedError } from "@/lib/google-auth";

export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!process.env.AFTERSHIP_API_KEY) {
    return NextResponse.json({ error: "AFTERSHIP_API_KEY not configured" }, { status: 503 });
  }

  try {
    const db = createServiceClient();
    const result = await syncPackages(db, user.id);
    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    if (err instanceof GoogleNotConnectedError) {
      return NextResponse.json(
        { error: "Google not connected. Connect Google in Settings.", not_connected: true },
        { status: 403 },
      );
    }
    console.error("[/api/sync/packages]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Sync failed" },
      { status: 500 },
    );
  }
}
