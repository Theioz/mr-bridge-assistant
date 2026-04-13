import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { syncOura } from "@/lib/sync/oura";
import { syncFitbit } from "@/lib/sync/fitbit";
import { syncGoogleFit } from "@/lib/sync/googlefit";
import { lastSyncAgeSecs } from "@/lib/sync/log";

const SKIP_WINDOW_SECS = 30 * 60; // 30 minutes — same as run-syncs.py

export async function GET(request: NextRequest) {
  // Verify Vercel cron secret
  const auth = request.headers.get("authorization");
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = createServiceClient();
  const results: Record<string, unknown> = {};

  // Purge notifications older than 30 days (TTL cleanup — runs once daily)
  await db
    .from("notifications")
    .delete()
    .lt("sent_at", new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString());

  // Run all three syncs in parallel, skipping any synced within the last 30 minutes
  const [ouraAge, fitbitAge, googleFitAge] = await Promise.all([
    lastSyncAgeSecs(db, "oura"),
    lastSyncAgeSecs(db, "fitbit"),
    lastSyncAgeSecs(db, "google_fit"),
  ]);

  const tasks: Promise<void>[] = [];

  if (ouraAge === null || ouraAge >= SKIP_WINDOW_SECS) {
    tasks.push(
      syncOura(db)
        .then((r) => { results.oura = r; })
        .catch((e) => { results.oura = { error: (e as Error).message }; }),
    );
  } else {
    results.oura = { skipped: true, ageSecs: Math.round(ouraAge) };
  }

  if (fitbitAge === null || fitbitAge >= SKIP_WINDOW_SECS) {
    tasks.push(
      syncFitbit(db)
        .then((r) => { results.fitbit = r; })
        .catch((e) => { results.fitbit = { error: (e as Error).message }; }),
    );
  } else {
    results.fitbit = { skipped: true, ageSecs: Math.round(fitbitAge) };
  }

  if (googleFitAge === null || googleFitAge >= SKIP_WINDOW_SECS) {
    tasks.push(
      syncGoogleFit(db)
        .then((r) => { results.googleFit = r; })
        .catch((e) => { results.googleFit = { error: (e as Error).message }; }),
    );
  } else {
    results.googleFit = { skipped: true, ageSecs: Math.round(googleFitAge) };
  }

  await Promise.all(tasks);

  return NextResponse.json({ success: true, results });
}
