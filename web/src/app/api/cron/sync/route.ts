import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { syncOura } from "@/lib/sync/oura";
import { syncFitbit } from "@/lib/sync/fitbit";
import { syncGoogleFit } from "@/lib/sync/googlefit";
import { syncStocks } from "@/lib/sync/stocks";
import { syncSports, type SportsFavorite } from "@/lib/sync/sports";
import { lastSyncAgeSecs } from "@/lib/sync/log";
import { listConnectedUsers } from "@/lib/integrations/tokens";

const SKIP_WINDOW_SECS = 30 * 60; // 30 minutes — same as run-syncs.py

export async function GET(request: NextRequest) {
  // Verify Vercel cron secret
  const auth = request.headers.get("authorization");
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const ownerUserId = process.env.OWNER_USER_ID;
  if (!ownerUserId) {
    return NextResponse.json({ error: "OWNER_USER_ID not configured" }, { status: 500 });
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

  if (ouraAge === null || ouraAge >= SKIP_WINDOW_SECS) {
    const userIds = await listConnectedUsers(db, "oura");
    const settled = await Promise.allSettled(userIds.map((uid) => syncOura(db, uid)));
    const errors = settled
      .map((s, i) => s.status === "rejected" ? { userId: userIds[i], error: (s.reason as Error).message } : null)
      .filter((e): e is { userId: string; error: string } => e !== null);
    results.oura = { usersSynced: settled.length - errors.length, usersFailed: errors.length, errors };
  } else {
    results.oura = { skipped: true, ageSecs: Math.round(ouraAge) };
  }

  if (fitbitAge === null || fitbitAge >= SKIP_WINDOW_SECS) {
    const userIds = await listConnectedUsers(db, "fitbit");
    const settled = await Promise.allSettled(userIds.map((uid) => syncFitbit(db, uid)));
    const errors = settled
      .map((s, i) => s.status === "rejected" ? { userId: userIds[i], error: (s.reason as Error).message } : null)
      .filter((e): e is { userId: string; error: string } => e !== null);
    results.fitbit = { usersSynced: settled.length - errors.length, usersFailed: errors.length, errors };
  } else {
    results.fitbit = { skipped: true, ageSecs: Math.round(fitbitAge) };
  }

  if (googleFitAge === null || googleFitAge >= SKIP_WINDOW_SECS) {
    const userIds = await listConnectedUsers(db, "google");
    const settled = await Promise.allSettled(userIds.map((uid) => syncGoogleFit(db, uid)));
    const errors = settled
      .map((s, i) => s.status === "rejected" ? { userId: userIds[i], error: (s.reason as Error).message } : null)
      .filter((e): e is { userId: string; error: string } => e !== null);
    results.googleFit = { usersSynced: settled.length - errors.length, usersFailed: errors.length, errors };
  } else {
    results.googleFit = { skipped: true, ageSecs: Math.round(googleFitAge) };
  }

  // Stocks sync — no skip window; EOD data doesn't change intraday
  const { data: watchlistRow } = await db
    .from("profile")
    .select("value")
    .eq("user_id", ownerUserId)
    .eq("key", "stock_watchlist")
    .single();

  const stockTickers: string[] = watchlistRow?.value
    ? (JSON.parse(watchlistRow.value) as string[])
    : [];

  if (stockTickers.length > 0) {
    try {
      results.stocks = await syncStocks(db, ownerUserId, stockTickers);
    } catch (e) {
      results.stocks = { error: (e as Error).message };
    }
  } else {
    results.stocks = { skipped: true, reason: "empty watchlist" };
  }

  // Sports sync — no skip window; daily refresh of schedules + standings
  const { data: sportsRow } = await db
    .from("profile")
    .select("value")
    .eq("user_id", ownerUserId)
    .eq("key", "sports_favorites")
    .single();

  const sportsFavorites: SportsFavorite[] = sportsRow?.value
    ? (JSON.parse(sportsRow.value) as SportsFavorite[])
    : [];

  if (sportsFavorites.length > 0) {
    try {
      results.sports = await syncSports(db, ownerUserId, sportsFavorites);
    } catch (e) {
      results.sports = { error: (e as Error).message };
    }
  } else {
    results.sports = { skipped: true, reason: "no favorites" };
  }

  return NextResponse.json({ success: true, results });
}
