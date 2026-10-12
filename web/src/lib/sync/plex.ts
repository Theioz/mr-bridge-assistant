import type { SupabaseClient } from "@supabase/supabase-js";
import { logSync } from "@/lib/sync/log";
import { fetchTmdbById, fetchTvDetail } from "@/lib/backlog/tmdb";

// Plex watch sync (#691). Polls Plex watch history — webhooks need Plex Pass — and turns
// it into library state:
//
//   movie watched  → `finished`, a session logged, rate prompt if unrated
//   episode watched → show `active` with watched/total progress; `finished` + rate prompt
//                     only once every episode is watched AND TMDB says the show has ended
//
// Titles not yet in the library are added from their TMDB GUID. Only watches from go-live
// onward count: the first run records a cursor and imports nothing, so years of Plex
// history do not become hundreds of rate prompts.

const CURSOR_KEY = "plex_sync_cursor";
const PAGE_SIZE = 200;
const TMDB_RECHECK_SECS = 24 * 60 * 60;
const DEDUPE_WINDOW_SECS = 3 * 60 * 60;

export interface PlexSyncResult {
  firstRun?: boolean;
  events: number;
  moviesFinished: number;
  showsUpdated: number;
  showsFinished: number;
  itemsCreated: number;
  sessionsLogged: number;
  unmatched: number;
}

interface PlexHistoryEntry {
  ratingKey?: string;
  grandparentKey?: string;
  type: string;
  viewedAt: number; // epoch seconds
}

interface PlexMetadata {
  ratingKey: string;
  type: string;
  title: string;
  duration?: number; // ms
  Guid?: { id: string }[];
}

interface PlexSeason {
  index?: number;
  leafCount?: number;
  viewedLeafCount?: number;
}

export interface ShowProgress {
  watched: number;
  total: number;
  last_watched_at?: string;
  tmdb_checked_at?: string;
}

interface Item {
  id: string;
  external_id: string;
  status: string;
  rating: number | null;
  started_at: string | null;
  finished_at: string | null;
  metadata: Record<string, unknown> | null;
}

class PlexClient {
  constructor(
    private baseUrl: string,
    private token: string,
  ) {}

  async get<T>(path: string, params: Record<string, string> = {}): Promise<T> {
    const url = new URL(path, this.baseUrl);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    const res = await fetch(url, {
      headers: { Accept: "application/json", "X-Plex-Token": this.token },
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) throw new Error(`Plex ${path} returned ${res.status}`);
    const body = (await res.json()) as { MediaContainer: T };
    return body.MediaContainer;
  }

  /** Metadata for one item, or null when Plex no longer has it (deleted since watching). */
  async metadata(ratingKey: string): Promise<PlexMetadata | null> {
    try {
      const mc = await this.get<{ Metadata?: PlexMetadata[] }>(`/library/metadata/${ratingKey}`, {
        includeGuids: "1",
      });
      return mc.Metadata?.[0] ?? null;
    } catch (e) {
      if ((e as Error).message.endsWith("returned 404")) return null;
      throw e;
    }
  }
}

function tmdbId(meta: PlexMetadata): string | null {
  const guid = meta.Guid?.find((g) => g.id.startsWith("tmdb://"));
  return guid ? guid.id.slice("tmdb://".length) : null;
}

const ITEM_COLUMNS = "id, external_id, status, rating, started_at, finished_at, metadata";

const iso = (epochSecs: number) => new Date(epochSecs * 1000).toISOString();

/**
 * A show is done only when it is fully watched AND finished airing. Plex counts only
 * the episodes it holds, so a library missing episodes would look complete — TMDB's
 * episode count guards that. Pure, so the rule is in one readable place.
 */
export function isShowComplete(
  progress: ShowProgress,
  tmdb: { in_production?: boolean; number_of_episodes?: number } | null,
): boolean {
  if (progress.total === 0 || progress.watched < progress.total) return false;
  if (!tmdb || tmdb.in_production !== false) return false;
  return (tmdb.number_of_episodes ?? 0) <= progress.total;
}

export async function syncPlex(db: SupabaseClient, userId: string): Promise<PlexSyncResult> {
  const baseUrl = process.env.PLEX_URL;
  const token = process.env.PLEX_TOKEN;
  if (!baseUrl || !token) throw new Error("PLEX_URL / PLEX_TOKEN not configured");
  // Watch history covers every account on the server; only the owner's watches are
  // this user's. Plex numbers the server owner 1.
  const accountId = process.env.PLEX_ACCOUNT_ID ?? "1";
  const plex = new PlexClient(baseUrl, token);

  const result: PlexSyncResult = {
    events: 0,
    moviesFinished: 0,
    showsUpdated: 0,
    showsFinished: 0,
    itemsCreated: 0,
    sessionsLogged: 0,
    unmatched: 0,
  };

  try {
    const { data: cursorRow } = await db
      .from("profile")
      .select("value")
      .eq("user_id", userId)
      .eq("key", CURSOR_KEY)
      .maybeSingle();

    if (!cursorRow) {
      // Reachability check before recording the cursor, so a misconfigured first run
      // fails loudly instead of silently starting the clock.
      await plex.get("/identity");
      await saveCursor(db, userId, Math.floor(Date.now() / 1000));
      await logSync(db, "plex", "ok", 0);
      return { ...result, firstRun: true };
    }

    const cursor = Number(cursorRow.value);
    const entries = await fetchHistory(plex, accountId, cursor);
    result.events = entries.length;

    const movies = entries.filter((e) => e.type === "movie" && e.ratingKey);
    // Group episodes by show: one progress read per show per run, however many episodes.
    const shows = new Map<string, { first: number; last: number }>();
    for (const e of entries) {
      if (e.type !== "episode" || !e.grandparentKey) continue;
      const showKey = e.grandparentKey.split("/").pop()!;
      const s = shows.get(showKey);
      shows.set(showKey, {
        first: Math.min(s?.first ?? e.viewedAt, e.viewedAt),
        last: Math.max(s?.last ?? e.viewedAt, e.viewedAt),
      });
    }

    for (const e of movies) await syncMovie(db, plex, userId, e, result);
    for (const [showKey, span] of shows) await syncShow(db, plex, userId, showKey, span, result);
    await recheckCaughtUpShows(db, userId, result);

    // Advance only after every event is handled: a failure above throws and leaves the
    // cursor where it was, so the next run retries. Re-processing is safe — sessions are
    // de-duplicated on their watch timestamp.
    const newest = entries.reduce((m, e) => Math.max(m, e.viewedAt), cursor);
    if (newest > cursor) await saveCursor(db, userId, newest);

    const written =
      result.moviesFinished + result.showsUpdated + result.itemsCreated + result.sessionsLogged;
    await logSync(db, "plex", "ok", written);
    return result;
  } catch (e) {
    await logSync(db, "plex", "error", 0);
    throw e;
  }
}

async function saveCursor(db: SupabaseClient, userId: string, epochSecs: number) {
  const { error } = await db
    .from("profile")
    .upsert(
      { user_id: userId, key: CURSOR_KEY, value: String(epochSecs) },
      { onConflict: "user_id,key" },
    );
  if (error) throw new Error(`plex cursor: ${error.message}`);
}

async function fetchHistory(
  plex: PlexClient,
  accountId: string,
  cursor: number,
): Promise<PlexHistoryEntry[]> {
  const out: PlexHistoryEntry[] = [];
  for (let start = 0; ; start += PAGE_SIZE) {
    const mc = await plex.get<{ Metadata?: PlexHistoryEntry[]; totalSize?: number }>(
      "/status/sessions/history/all",
      {
        sort: "viewedAt:asc",
        accountID: accountId,
        // Strictly after the cursor: the entry AT the cursor was handled last run.
        "viewedAt>": String(cursor + 1),
        "X-Plex-Container-Start": String(start),
        "X-Plex-Container-Size": String(PAGE_SIZE),
      },
    );
    const page = mc.Metadata ?? [];
    out.push(...page);
    if (page.length < PAGE_SIZE) return out;
  }
}

/** Find the library row for a TMDB id, creating it from TMDB when absent. */
async function findOrCreate(
  db: SupabaseClient,
  userId: string,
  mediaType: "movie" | "show",
  externalId: string,
  result: PlexSyncResult,
): Promise<Item | null> {
  const { data: existing, error } = await db
    .from("backlog_items")
    .select(ITEM_COLUMNS)
    .eq("user_id", userId)
    .eq("media_type", mediaType)
    .eq("external_source", "tmdb")
    .eq("external_id", externalId)
    .maybeSingle();
  if (error) throw new Error(`backlog lookup: ${error.message}`);
  if (existing) return existing as Item;

  const tmdb = await fetchTmdbById(externalId, mediaType);
  if (!tmdb) return null;

  const { data: maxRow } = await db
    .from("backlog_items")
    .select("priority")
    .eq("user_id", userId)
    .eq("media_type", mediaType)
    .order("priority", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: created, error: insertError } = await db
    .from("backlog_items")
    .insert({
      user_id: userId,
      media_type: mediaType,
      title: tmdb.title,
      creator: tmdb.creator || null,
      release_date: tmdb.release_date,
      description: tmdb.description || null,
      cover_url: tmdb.cover_url || null,
      external_id: tmdb.external_id,
      external_source: "tmdb",
      metadata: { ...tmdb.metadata, added_from: "plex" },
      // Created untouched; the caller applies the watch like any other first watch.
      status: "backlog",
      priority: (maxRow?.priority ?? -1) + 1,
    })
    .select(ITEM_COLUMNS)
    .single();
  if (insertError) throw new Error(`backlog insert: ${insertError.message}`);
  result.itemsCreated++;
  return created as Item;
}

async function syncMovie(
  db: SupabaseClient,
  plex: PlexClient,
  userId: string,
  entry: PlexHistoryEntry,
  result: PlexSyncResult,
) {
  const meta = await plex.metadata(entry.ratingKey!);
  const id = meta && tmdbId(meta);
  if (!id) {
    result.unmatched++;
    return;
  }
  const item = await findOrCreate(db, userId, "movie", id, result);
  if (!item) {
    result.unmatched++;
    return;
  }

  const finishedAt = iso(entry.viewedAt);
  const startedAt = meta.duration
    ? iso(entry.viewedAt - Math.round(meta.duration / 1000))
    : finishedAt;

  // One viewing, one session. A retried run sees the same entry again, and Plex itself
  // writes a second history entry minutes later when an item is re-marked watched
  // (observed live) — so anything finishing within DEDUPE_WINDOW_SECS is this viewing.
  const { data: dup } = await db
    .from("backlog_sessions")
    .select("id")
    .eq("item_id", item.id)
    .gte("finished_at", iso(entry.viewedAt - DEDUPE_WINDOW_SECS))
    .lte("finished_at", iso(entry.viewedAt + DEDUPE_WINDOW_SECS))
    .limit(1)
    .maybeSingle();
  if (!dup) {
    const { error } = await db.from("backlog_sessions").insert({
      item_id: item.id,
      user_id: userId,
      started_at: startedAt,
      finished_at: finishedAt,
      notes: "Watched on Plex",
    });
    if (error) throw new Error(`session insert: ${error.message}`);
    result.sessionsLogged++;
  }

  // A rewatch of a finished movie only adds the session above — the original
  // finished_at is history, not something a rewatch should overwrite.
  if (item.status === "finished") return;

  const { error } = await db
    .from("backlog_items")
    .update({
      status: "finished",
      started_at: item.started_at ?? startedAt,
      finished_at: finishedAt,
      rate_prompt_at: item.rating === null ? new Date().toISOString() : null,
    })
    .eq("id", item.id);
  if (error) throw new Error(`movie update: ${error.message}`);
  result.moviesFinished++;
}

async function showProgress(plex: PlexClient, showKey: string): Promise<ShowProgress> {
  // Sum per season rather than reading the show's own leafCount, which includes
  // specials — an unwatched Season 0 extra would otherwise block completion forever.
  const mc = await plex.get<{ Metadata?: PlexSeason[] }>(`/library/metadata/${showKey}/children`);
  let watched = 0;
  let total = 0;
  for (const season of mc.Metadata ?? []) {
    if (!season.index) continue;
    watched += season.viewedLeafCount ?? 0;
    total += season.leafCount ?? 0;
  }
  return { watched, total };
}

async function syncShow(
  db: SupabaseClient,
  plex: PlexClient,
  userId: string,
  showKey: string,
  span: { first: number; last: number },
  result: PlexSyncResult,
) {
  const meta = await plex.metadata(showKey);
  const id = meta && tmdbId(meta);
  if (!id) {
    result.unmatched++;
    return;
  }
  const item = await findOrCreate(db, userId, "show", id, result);
  if (!item) {
    result.unmatched++;
    return;
  }

  const progress = { ...(await showProgress(plex, showKey)), last_watched_at: iso(span.last) };
  const patch: Record<string, unknown> = {
    metadata: { ...(item.metadata ?? {}), plex_progress: progress },
  };

  // An episode of an already-finished show is a rewatch: track progress, nothing else.
  if (item.status !== "finished") {
    patch.status = "active";
    patch.started_at = item.started_at ?? iso(span.first);
    await ensureOpenSession(db, userId, item.id, iso(span.first), result);
    if (progress.watched >= progress.total) {
      Object.assign(patch, await completionPatch(db, userId, item, progress));
      if (patch.status === "finished") result.showsFinished++;
    }
  }

  const { error } = await db.from("backlog_items").update(patch).eq("id", item.id);
  if (error) throw new Error(`show update: ${error.message}`);
  result.showsUpdated++;
}

async function ensureOpenSession(
  db: SupabaseClient,
  userId: string,
  itemId: string,
  startedAt: string,
  result: PlexSyncResult,
) {
  const { data: open } = await db
    .from("backlog_sessions")
    .select("id")
    .eq("item_id", itemId)
    .is("finished_at", null)
    .limit(1)
    .maybeSingle();
  if (open) return;
  const { error } = await db.from("backlog_sessions").insert({
    item_id: itemId,
    user_id: userId,
    started_at: startedAt,
    notes: "Watching on Plex",
  });
  if (error) throw new Error(`session insert: ${error.message}`);
  result.sessionsLogged++;
}

/**
 * Called when every episode Plex holds is watched. Asks TMDB whether the show has ended;
 * returns the fields to write — `finished` + prompt if so, otherwise just the recheck
 * stamp so `recheckCaughtUpShows` knows when to ask again.
 */
async function completionPatch(
  db: SupabaseClient,
  userId: string,
  item: Item,
  progress: ShowProgress,
): Promise<Record<string, unknown>> {
  const tmdb = await fetchTvDetail(Number(item.external_id));
  const metadata = {
    ...(item.metadata ?? {}),
    ...(tmdb ? { in_production: tmdb.in_production, last_air_date: tmdb.last_air_date } : {}),
    plex_progress: { ...progress, tmdb_checked_at: new Date().toISOString() },
  };
  if (!isShowComplete(progress, tmdb)) return { metadata };

  // The last episode watched is the finish, even when the recheck discovers it later.
  const finishedAt = progress.last_watched_at ?? new Date().toISOString();
  const { error } = await db
    .from("backlog_sessions")
    .update({ finished_at: finishedAt, notes: "Watched on Plex" })
    .eq("item_id", item.id)
    .eq("user_id", userId)
    .is("finished_at", null);
  if (error) throw new Error(`session close: ${error.message}`);

  return {
    metadata,
    status: "finished",
    finished_at: finishedAt,
    rate_prompt_at: item.rating === null ? new Date().toISOString() : null,
  };
}

/**
 * A show you are caught up on that is still airing produces no new watch events when it
 * ends — the finale you already saw was the last one. Re-ask TMDB about those daily so
 * the rate prompt still fires once the show is over.
 */
async function recheckCaughtUpShows(db: SupabaseClient, userId: string, result: PlexSyncResult) {
  const { data: rows, error } = await db
    .from("backlog_items")
    .select(ITEM_COLUMNS)
    .eq("user_id", userId)
    .eq("media_type", "show")
    .eq("status", "active")
    .not("metadata->plex_progress", "is", null);
  if (error) throw new Error(`recheck lookup: ${error.message}`);

  const now = Date.now();
  for (const item of (rows ?? []) as Item[]) {
    const progress = item.metadata?.plex_progress as ShowProgress | undefined;
    if (!progress || progress.total === 0 || progress.watched < progress.total) continue;
    const checked = progress.tmdb_checked_at ? Date.parse(progress.tmdb_checked_at) : 0;
    if (now - checked < TMDB_RECHECK_SECS * 1000) continue;

    const patch = await completionPatch(db, userId, item, progress);
    const { error: updateError } = await db.from("backlog_items").update(patch).eq("id", item.id);
    if (updateError) throw new Error(`recheck update: ${updateError.message}`);
    if (patch.status === "finished") result.showsFinished++;
  }
}
