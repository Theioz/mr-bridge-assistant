import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { syncOura } from "@/lib/sync/oura";
import { syncGoogleHealth } from "@/lib/sync/google-health";
import { syncStocks } from "@/lib/sync/stocks";
import { syncPlex } from "@/lib/sync/plex";
import { syncSports } from "@/lib/sync/sports";
import { lastSyncAgeSecs } from "@/lib/sync/log";
import { listConnectedUsers } from "@/lib/integrations/tokens";
import { isAuthorizedCron, parseCronParams, runCronSync } from "@/lib/sync/cron";

// The orchestration (skip windows, per-source isolation) lives in lib/sync/cron.ts, where
// it is contract-tested (#761). This route is only the HTTP edge.
export async function GET(request: NextRequest) {
  // Bearer CRON_SECRET — called by compute-core's crontab and scripts/run-syncs.py
  if (!isAuthorizedCron(request.headers.get("authorization"), process.env.CRON_SECRET)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const ownerUserId = process.env.OWNER_USER_ID;
  if (!ownerUserId) {
    return NextResponse.json({ error: "OWNER_USER_ID not configured" }, { status: 500 });
  }

  const db = createServiceClient();
  const { days, force } = parseCronParams(request.nextUrl.searchParams);

  const results = await runCronSync(
    db,
    { ownerUserId, days, force },
    {
      lastSyncAgeSecs,
      listConnectedUsers,
      syncOura,
      syncGoogleHealth,
      syncPlex,
      syncStocks,
      syncSports,
    },
  );

  return NextResponse.json({ success: true, results });
}
