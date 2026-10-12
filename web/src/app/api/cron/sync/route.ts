import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { syncOura } from "@/lib/sync/oura";
import { syncGoogleHealth } from "@/lib/sync/google-health";
import { syncStocks } from "@/lib/sync/stocks";
import { syncPlex } from "@/lib/sync/plex";
import { syncSports, type SportsFavorite } from "@/lib/sync/sports";
import { lastSyncAgeSecs } from "@/lib/sync/log";
import { listConnectedUsers } from "@/lib/integrations/tokens";

const SKIP_WINDOW_SECS = 30 * 60; // 30 minutes — same as run-syncs.py

export async function GET(request: NextRequest) {
  // Bearer CRON_SECRET — called by compute-core's crontab and scripts/run-syncs.py
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

  // Optional ?days=N backfill, and ?force=1 to bypass the 30-minute skip window. Both
  // exist so the CLI (scripts/run-syncs.py) keeps the reach the deleted Python syncs had
  // — they took --days. Bounded at 90 so a typo cannot request a year of API calls.
  const daysParam = Number(request.nextUrl.searchParams.get("days"));
  const days =
    Number.isFinite(daysParam) && daysParam >= 1 ? Math.min(Math.floor(daysParam), 90) : null;
  const force = request.nextUrl.searchParams.get("force") === "1" || days !== null;

  // Purge notifications older than 30 days (TTL cleanup — runs once daily)
  await db
    .from("notifications")
    .delete()
    .lt("sent_at", new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString());

  // Run both health syncs in parallel, skipping any synced within the last 30 minutes.
  // Fitbit and Google Fit were folded into Google Health — see #607.
  const [ouraAge, googleHealthAge, plexAge] = await Promise.all([
    lastSyncAgeSecs(db, "oura"),
    lastSyncAgeSecs(db, "google_health"),
    lastSyncAgeSecs(db, "plex"),
  ]);

  if (force || ouraAge === null || ouraAge >= SKIP_WINDOW_SECS) {
    const userIds = await listConnectedUsers(db, "oura");
    const settled = await Promise.allSettled(
      userIds.map((uid) => (days === null ? syncOura(db, uid) : syncOura(db, uid, days))),
    );
    const errors = settled
      .map((s, i) =>
        s.status === "rejected" ? { userId: userIds[i], error: (s.reason as Error).message } : null,
      )
      .filter((e): e is { userId: string; error: string } => e !== null);
    results.oura = {
      usersSynced: settled.length - errors.length,
      usersFailed: errors.length,
      errors,
    };
  } else {
    results.oura = { skipped: true, ageSecs: Math.round(ouraAge) };
  }

  if (force || googleHealthAge === null || googleHealthAge >= SKIP_WINDOW_SECS) {
    const userIds = await listConnectedUsers(db, "google_health");
    const settled = await Promise.allSettled(
      userIds.map((uid) =>
        days === null ? syncGoogleHealth(db, uid) : syncGoogleHealth(db, uid, days),
      ),
    );
    const errors = settled
      .map((s, i) =>
        s.status === "rejected" ? { userId: userIds[i], error: (s.reason as Error).message } : null,
      )
      .filter((e): e is { userId: string; error: string } => e !== null);
    results.googleHealth = {
      usersSynced: settled.length - errors.length,
      usersFailed: errors.length,
      errors,
    };
  } else {
    results.googleHealth = { skipped: true, ageSecs: Math.round(googleHealthAge) };
  }

  // Plex watch sync (#691) — owner only, since the Plex server is the owner's. Its own
  // try/catch: an unreachable Plex logs a failure and must not take the other sources
  // down with it. `days` does not apply: Plex syncs from a cursor, not a window.
  if (!process.env.PLEX_URL || !process.env.PLEX_TOKEN) {
    results.plex = { skipped: true, reason: "PLEX_URL / PLEX_TOKEN not set" };
  } else if (force || plexAge === null || plexAge >= SKIP_WINDOW_SECS) {
    try {
      results.plex = await syncPlex(db, ownerUserId);
    } catch (e) {
      results.plex = { error: (e as Error).message };
    }
  } else {
    results.plex = { skipped: true, ageSecs: Math.round(plexAge) };
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
