// Contract tests for the Plex watch sync (#691, #761).
// Run with: node --experimental-strip-types --test src/__tests__/plex-sync.test.ts
// (from the web/ directory)
//
// WHY THIS EXISTS
//
// syncPlex runs unattended every night and writes library state nobody watches being
// written: a bug here shows up weeks later as a show stuck "active", a movie logged twice,
// or a flood of rate prompts for years of old history. These tests run the real sync
// against an in-memory database and a stubbed Plex + TMDB, and pin the rules that matter:
// first run imports nothing, a watch finishes a movie exactly once, an episode makes a show
// active, a show finishes only when TMDB says it has ended, and an outage is logged.

import { afterEach, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";

import { syncPlex } from "../lib/sync/plex.ts";
import { FakeSupabase, type Row } from "./helpers/fake-supabase.ts";

const USER = "user-1";
const PLEX = "http://plex.test:32400";
const iso = (secs: number) => new Date(secs * 1000).toISOString();

type Routes = Record<string, unknown | ((url: URL) => unknown)>;

/** Stub fetch: `routes` maps a URL path to a JSON body (or a number = HTTP status). */
function stubFetch(routes: Routes) {
  const seen: URL[] = [];
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    seen.push(url);
    const key = url.origin === PLEX ? url.pathname : `${url.origin}${url.pathname}`;
    if (!(key in routes)) return new Response("not found", { status: 404 });
    const route = routes[key];
    const body = typeof route === "function" ? route(url) : route;
    if (typeof body === "number") return new Response("err", { status: body });
    return Response.json(body);
  }) as typeof fetch;
  return seen;
}

const container = (body: Record<string, unknown>) => ({ MediaContainer: body });
const history = (entries: Row[]) =>
  container({ Metadata: entries, totalSize: entries.length, size: entries.length });

const cursorRow = (secs: number) => ({
  user_id: USER,
  key: "plex_sync_cursor",
  value: String(secs),
});

function item(over: Row): Row {
  return {
    user_id: USER,
    external_source: "tmdb",
    status: "backlog",
    rating: null,
    started_at: null,
    finished_at: null,
    metadata: null,
    priority: 0,
    ...over,
  };
}

const realFetch = globalThis.fetch;
const savedEnv = { ...process.env };

beforeEach(() => {
  process.env.PLEX_URL = PLEX;
  process.env.PLEX_TOKEN = "plex-token";
  process.env.TMDB_API_KEY = "tmdb-key";
  delete process.env.PLEX_ACCOUNT_ID;
});

afterEach(() => {
  globalThis.fetch = realFetch;
  process.env = { ...savedEnv };
});

describe("syncPlex — first run", () => {
  it("records a cursor and imports nothing", async () => {
    const db = new FakeSupabase();
    const seen = stubFetch({ "/identity": container({ machineIdentifier: "x" }) });

    const before = Math.floor(Date.now() / 1000);
    const result = await syncPlex(db.client, USER);

    assert.equal(result.firstRun, true);
    assert.equal(result.events, 0);
    assert.deepEqual(
      seen.map((u) => u.pathname),
      ["/identity"],
      "must not read watch history on the first run",
    );
    const [cursor] = db.table("profile");
    assert.equal(cursor.key, "plex_sync_cursor");
    assert.ok(Number(cursor.value) >= before);
    assert.equal(db.table("backlog_items").length, 0);
    assert.equal(db.table("backlog_sessions").length, 0);
    assert.deepEqual(
      db.table("sync_log").map((r) => [r.source, r.status]),
      [["plex", "ok"]],
    );
  });
});

describe("syncPlex — movies", () => {
  const plexMovie = (viewedAt: number) => ({
    "/status/sessions/history/all": history([{ type: "movie", ratingKey: "55", viewedAt }]),
    "/library/metadata/55": container({
      Metadata: [
        {
          ratingKey: "55",
          type: "movie",
          title: "The Matrix",
          duration: 2 * 3600 * 1000,
          Guid: [{ id: "imdb://tt0133093" }, { id: "tmdb://603" }],
        },
      ],
    }),
  });

  it("finishes the movie, logs a session, and sets rate_prompt_at when unrated", async () => {
    const db = new FakeSupabase({
      profile: [cursorRow(1_000)],
      backlog_items: [item({ id: "m1", media_type: "movie", external_id: "603" })],
    });
    const seen = stubFetch(plexMovie(5_000_000));

    const result = await syncPlex(db.client, USER);

    assert.equal(result.events, 1);
    assert.equal(result.moviesFinished, 1);
    assert.equal(result.sessionsLogged, 1);
    const historyUrl = seen.find((u) => u.pathname === "/status/sessions/history/all")!;
    assert.equal(historyUrl.searchParams.get("viewedAt>"), "1001", "strictly after the cursor");
    assert.equal(historyUrl.searchParams.get("accountID"), "1", "owner account by default");

    const [movie] = db.table("backlog_items");
    assert.equal(movie.status, "finished");
    assert.equal(movie.finished_at, iso(5_000_000));
    assert.equal(movie.started_at, iso(5_000_000 - 7200));
    assert.ok(movie.rate_prompt_at, "unrated → rate prompt");

    const [session] = db.table("backlog_sessions");
    assert.equal(session.item_id, "m1");
    assert.equal(session.finished_at, iso(5_000_000));
    assert.equal(db.table("profile")[0].value, "5000000", "cursor advanced to newest event");
    assert.deepEqual(
      db.table("sync_log").map((r) => [r.status, r.records_written]),
      [["ok", 2]],
    );
  });

  it("does not set rate_prompt_at for an already-rated movie", async () => {
    const db = new FakeSupabase({
      profile: [cursorRow(1_000)],
      backlog_items: [item({ id: "m1", media_type: "movie", external_id: "603", rating: 4 })],
    });
    stubFetch(plexMovie(5_000_000));
    await syncPlex(db.client, USER);
    assert.equal(db.table("backlog_items")[0].status, "finished");
    assert.equal(db.table("backlog_items")[0].rate_prompt_at, null);
  });

  it("adds a movie missing from the library from its TMDB id", async () => {
    const db = new FakeSupabase({ profile: [cursorRow(1_000)] });
    stubFetch({
      ...plexMovie(5_000_000),
      "https://api.themoviedb.org/3/movie/603": {
        id: 603,
        title: "The Matrix",
        release_date: "1999-03-31",
        genres: [{ id: 878 }],
        credits: { crew: [{ job: "Director", name: "Lana Wachowski" }] },
      },
    });

    const result = await syncPlex(db.client, USER);

    assert.equal(result.itemsCreated, 1);
    const [movie] = db.table("backlog_items");
    assert.equal(movie.external_id, "603");
    assert.equal(movie.title, "The Matrix");
    assert.equal(movie.status, "finished");
    assert.equal((movie.metadata as Row).added_from, "plex");
  });

  it("does not double-log a viewing that already has a session within 3h", async () => {
    const viewedAt = 5_000_000;
    const db = new FakeSupabase({
      profile: [cursorRow(1_000)],
      backlog_items: [
        item({ id: "m1", media_type: "movie", external_id: "603", status: "finished", rating: 5 }),
      ],
      backlog_sessions: [
        { id: "s1", item_id: "m1", user_id: USER, finished_at: iso(viewedAt - 2 * 3600) },
      ],
    });
    stubFetch(plexMovie(viewedAt));

    const result = await syncPlex(db.client, USER);

    assert.equal(result.sessionsLogged, 0);
    assert.equal(db.table("backlog_sessions").length, 1);
  });

  it("logs one session when Plex writes two history entries for one viewing", async () => {
    const db = new FakeSupabase({
      profile: [cursorRow(1_000)],
      backlog_items: [item({ id: "m1", media_type: "movie", external_id: "603" })],
    });
    stubFetch({
      ...plexMovie(0),
      "/status/sessions/history/all": history([
        { type: "movie", ratingKey: "55", viewedAt: 5_000_000 },
        { type: "movie", ratingKey: "55", viewedAt: 5_000_000 + 600 },
      ]),
    });

    const result = await syncPlex(db.client, USER);

    assert.equal(result.events, 2);
    assert.equal(result.sessionsLogged, 1);
    assert.equal(db.table("backlog_sessions").length, 1);
  });
});

describe("syncPlex — shows", () => {
  const SHOW = "77";
  const plexShow = (seasons: Row[], viewedAt = 6_000_000) => ({
    "/status/sessions/history/all": history([
      {
        type: "episode",
        ratingKey: "901",
        grandparentKey: `/library/metadata/${SHOW}`,
        viewedAt,
      },
    ]),
    [`/library/metadata/${SHOW}`]: container({
      Metadata: [
        { ratingKey: SHOW, type: "show", title: "Severance", Guid: [{ id: "tmdb://95396" }] },
      ],
    }),
    [`/library/metadata/${SHOW}/children`]: container({ Metadata: seasons }),
  });
  const tvUrl = "https://api.themoviedb.org/3/tv/95396";

  it("moves a show to active with plex_progress, ignoring specials", async () => {
    const db = new FakeSupabase({
      profile: [cursorRow(1_000)],
      backlog_items: [item({ id: "t1", media_type: "show", external_id: "95396" })],
    });
    const seen = stubFetch(
      plexShow([
        { index: 0, leafCount: 3, viewedLeafCount: 0 },
        { index: 1, leafCount: 10, viewedLeafCount: 2 },
      ]),
    );

    const result = await syncPlex(db.client, USER);

    assert.equal(result.showsUpdated, 1);
    assert.equal(result.showsFinished, 0);
    const [show] = db.table("backlog_items");
    assert.equal(show.status, "active");
    assert.equal(show.started_at, iso(6_000_000));
    assert.deepEqual((show.metadata as Row).plex_progress, {
      watched: 2,
      total: 10,
      last_watched_at: iso(6_000_000),
    });
    const sessions = db.table("backlog_sessions");
    assert.equal(sessions.length, 1, "an open session is started");
    assert.equal(sessions[0].finished_at, undefined);
    assert.ok(
      !seen.some((u) => u.hostname === "api.themoviedb.org"),
      "TMDB is only asked once every episode is watched",
    );
  });

  it("keeps a fully watched show active while TMDB says it is still in production", async () => {
    const db = new FakeSupabase({
      profile: [cursorRow(1_000)],
      backlog_items: [item({ id: "t1", media_type: "show", external_id: "95396" })],
    });
    stubFetch({
      ...plexShow([{ index: 1, leafCount: 10, viewedLeafCount: 10 }]),
      // Episode counts agree, so in_production is the only thing holding the show open.
      [tvUrl]: { in_production: true, number_of_episodes: 10, last_air_date: "2025-03-21" },
    });

    const result = await syncPlex(db.client, USER);

    assert.equal(result.showsFinished, 0);
    const [show] = db.table("backlog_items");
    assert.equal(show.status, "active");
    assert.equal(show.rate_prompt_at, undefined);
    const meta = show.metadata as Row;
    assert.equal(meta.in_production, true);
    assert.ok((meta.plex_progress as Row).tmdb_checked_at, "recheck stamp recorded");
    assert.equal(db.table("backlog_sessions")[0].finished_at, undefined, "session stays open");
  });

  it("finishes a fully watched show once TMDB says it has ended", async () => {
    const db = new FakeSupabase({
      profile: [cursorRow(1_000)],
      backlog_items: [item({ id: "t1", media_type: "show", external_id: "95396" })],
    });
    stubFetch({
      ...plexShow([{ index: 1, leafCount: 10, viewedLeafCount: 10 }]),
      [tvUrl]: { in_production: false, number_of_episodes: 10, last_air_date: "2022-04-08" },
    });

    const result = await syncPlex(db.client, USER);

    assert.equal(result.showsFinished, 1);
    const [show] = db.table("backlog_items");
    assert.equal(show.status, "finished");
    assert.equal(show.finished_at, iso(6_000_000));
    assert.ok(show.rate_prompt_at, "unrated → rate prompt");
    const [session] = db.table("backlog_sessions");
    assert.equal(session.finished_at, iso(6_000_000), "open session closed at the last watch");
  });

  it("does not finish a show when Plex is missing episodes TMDB knows about", async () => {
    const db = new FakeSupabase({
      profile: [cursorRow(1_000)],
      backlog_items: [item({ id: "t1", media_type: "show", external_id: "95396" })],
    });
    stubFetch({
      ...plexShow([{ index: 1, leafCount: 8, viewedLeafCount: 8 }]),
      [tvUrl]: { in_production: false, number_of_episodes: 10 },
    });

    await syncPlex(db.client, USER);

    assert.equal(db.table("backlog_items")[0].status, "active");
  });
});

describe("syncPlex — failure", () => {
  it("logs a sync_log error row and throws when Plex is unreachable", async () => {
    const db = new FakeSupabase({ profile: [cursorRow(1_000)] });
    globalThis.fetch = (async () => {
      throw new TypeError("fetch failed");
    }) as typeof fetch;

    await assert.rejects(() => syncPlex(db.client, USER), /fetch failed/);

    assert.deepEqual(
      db.table("sync_log").map((r) => [r.source, r.status, r.records_written]),
      [["plex", "error", 0]],
    );
    assert.equal(db.table("profile")[0].value, "1000", "cursor not advanced");
  });

  it("logs an error and records no cursor when the first-run reachability check fails", async () => {
    const db = new FakeSupabase();
    stubFetch({ "/identity": 401 });

    await assert.rejects(() => syncPlex(db.client, USER), /Plex \/identity returned 401/);

    assert.equal(db.table("profile").length, 0);
    assert.deepEqual(
      db.table("sync_log").map((r) => r.status),
      ["error"],
    );
  });

  it("throws without touching the database when PLEX_URL / PLEX_TOKEN are unset", async () => {
    delete process.env.PLEX_TOKEN;
    const db = new FakeSupabase();
    await assert.rejects(() => syncPlex(db.client, USER), /not configured/);
    assert.equal(db.calls.length, 0);
  });
});
