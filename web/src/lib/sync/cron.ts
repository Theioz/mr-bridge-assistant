import type { SupabaseClient } from "@supabase/supabase-js";
import type { syncOura } from "./oura";
import type { syncGoogleHealth } from "./google-health";
import type { syncStocks } from "./stocks";
import type { syncPlex } from "./plex";
import type { syncSports, SportsFavorite } from "./sports";
import type { lastSyncAgeSecs } from "./log";
import type { listConnectedUsers } from "../integrations/tokens";

/**
 * Orchestration behind `GET /api/cron/sync` — the nightly cron and `scripts/run-syncs.py`.
 *
 * Lives here rather than in the route so it can be contract-tested (#761): this module has
 * only type imports, and the route passes the real sync functions in as `deps`. The route
 * itself keeps just the HTTP edge — auth, OWNER_USER_ID, the service client.
 */

const SKIP_WINDOW_SECS = 30 * 60; // 30 minutes — same as run-syncs.py

export interface CronSyncDeps {
  lastSyncAgeSecs: typeof lastSyncAgeSecs;
  listConnectedUsers: typeof listConnectedUsers;
  syncOura: typeof syncOura;
  syncGoogleHealth: typeof syncGoogleHealth;
  syncPlex: typeof syncPlex;
  syncStocks: typeof syncStocks;
  syncSports: typeof syncSports;
}

/** Vercel-style cron auth: `Authorization: Bearer $CRON_SECRET`. No secret → nobody. */
export function isAuthorizedCron(authHeader: string | null, secret: string | undefined): boolean {
  return Boolean(secret) && authHeader === `Bearer ${secret}`;
}

/**
 * Optional ?days=N backfill, and ?force=1 to bypass the 30-minute skip window. Both exist so
 * the CLI (scripts/run-syncs.py) keeps the reach the deleted Python syncs had — they took
 * --days. Bounded at 90 so a typo cannot request a year of API calls.
 */
export function parseCronParams(params: URLSearchParams): { days: number | null; force: boolean } {
  const daysParam = Number(params.get("days"));
  const days =
    Number.isFinite(daysParam) && daysParam >= 1 ? Math.min(Math.floor(daysParam), 90) : null;
  const force = params.get("force") === "1" || days !== null;
  return { days, force };
}

export async function runCronSync(
  db: SupabaseClient,
  opts: { ownerUserId: string; days: number | null; force: boolean },
  deps: CronSyncDeps,
): Promise<Record<string, unknown>> {
  const { ownerUserId, days, force } = opts;
  const results: Record<string, unknown> = {};

  // Purge notifications older than 30 days (TTL cleanup — runs once daily)
  await db
    .from("notifications")
    .delete()
    .lt("sent_at", new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString());

  // Run both health syncs in parallel, skipping any synced within the last 30 minutes.
  // Fitbit and Google Fit were folded into Google Health — see #607.
  const [ouraAge, googleHealthAge, plexAge] = await Promise.all([
    deps.lastSyncAgeSecs(db, "oura"),
    deps.lastSyncAgeSecs(db, "google_health"),
    deps.lastSyncAgeSecs(db, "plex"),
  ]);

  if (force || ouraAge === null || ouraAge >= SKIP_WINDOW_SECS) {
    const userIds = await deps.listConnectedUsers(db, "oura");
    const settled = await Promise.allSettled(
      userIds.map((uid) => (days === null ? deps.syncOura(db, uid) : deps.syncOura(db, uid, days))),
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
    const userIds = await deps.listConnectedUsers(db, "google_health");
    const settled = await Promise.allSettled(
      userIds.map((uid) =>
        days === null ? deps.syncGoogleHealth(db, uid) : deps.syncGoogleHealth(db, uid, days),
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
      results.plex = await deps.syncPlex(db, ownerUserId);
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
      results.stocks = await deps.syncStocks(db, ownerUserId, stockTickers);
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
      results.sports = await deps.syncSports(db, ownerUserId, sportsFavorites);
    } catch (e) {
      results.sports = { error: (e as Error).message };
    }
  } else {
    results.sports = { skipped: true, reason: "no favorites" };
  }

  return results;
}
