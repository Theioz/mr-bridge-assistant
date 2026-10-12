// Contract tests for the /api/cron/sync orchestration (#658, #691, #761).
// Run with: node --experimental-strip-types --test src/__tests__/cron-sync.test.ts
// (from the web/ directory)
//
// WHY THIS EXISTS
//
// One endpoint refreshes every data source nightly, and the briefing trusts whatever it
// left behind. The rule that matters most is isolation: one broken source (Plex down, a
// revoked Oura token) must be reported, not take the rest of the run with it. The route
// delegates to lib/sync/cron.ts; these tests run that with stub syncs and an in-memory db.

import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";

import {
  isAuthorizedCron,
  parseCronParams,
  runCronSync,
  type CronSyncDeps,
} from "../lib/sync/cron.ts";
import { FakeSupabase } from "./helpers/fake-supabase.ts";

const OWNER = "owner-1";

type Calls = Record<string, unknown[][]>;

/** Stub deps: every source "never synced", one connected user per provider. */
function deps(over: Partial<Record<keyof CronSyncDeps, unknown>> = {}) {
  const calls: Calls = {};
  const record =
    (name: string, impl: (...args: unknown[]) => unknown) =>
    async (...args: unknown[]) => {
      (calls[name] ??= []).push(args.slice(1)); // drop the db
      return impl(...args);
    };
  const base: Record<keyof CronSyncDeps, (...args: unknown[]) => unknown> = {
    lastSyncAgeSecs: () => null,
    listConnectedUsers: () => [OWNER],
    syncOura: () => ({ ok: "oura" }),
    syncGoogleHealth: () => ({ ok: "google_health" }),
    syncPlex: () => ({ ok: "plex" }),
    syncStocks: () => ({ ok: "stocks" }),
    syncSports: () => ({ ok: "sports" }),
  };
  const d = Object.fromEntries(
    Object.entries({ ...base, ...over }).map(([k, impl]) => [
      k,
      record(k, impl as (...args: unknown[]) => unknown),
    ]),
  ) as unknown as CronSyncDeps;
  return { deps: d, calls };
}

const run = (
  db: FakeSupabase,
  d: CronSyncDeps,
  opts: { days?: number | null; force?: boolean } = {},
) =>
  runCronSync(
    db.client,
    { ownerUserId: OWNER, days: opts.days ?? null, force: opts.force ?? false },
    d,
  );

const savedEnv = { ...process.env };
beforeEach(() => {
  process.env.PLEX_URL = "http://plex.test:32400";
  process.env.PLEX_TOKEN = "t";
});
afterEach(() => {
  process.env = { ...savedEnv };
});

describe("cron auth", () => {
  it("requires the exact bearer secret", () => {
    assert.equal(isAuthorizedCron("Bearer s3cret", "s3cret"), true);
    assert.equal(isAuthorizedCron(null, "s3cret"), false);
    assert.equal(isAuthorizedCron("Bearer wrong", "s3cret"), false);
    assert.equal(isAuthorizedCron("s3cret", "s3cret"), false);
  });

  it("rejects everyone when CRON_SECRET is unset — even `Bearer undefined`", () => {
    assert.equal(isAuthorizedCron("Bearer undefined", undefined), false);
    assert.equal(isAuthorizedCron("Bearer ", ""), false);
    assert.equal(isAuthorizedCron(null, undefined), false);
  });
});

describe("cron params", () => {
  it("defaults to no backfill and no force", () => {
    assert.deepEqual(parseCronParams(new URLSearchParams("")), { days: null, force: false });
  });
  it("?force=1 bypasses the skip window", () => {
    assert.deepEqual(parseCronParams(new URLSearchParams("force=1")), { days: null, force: true });
  });
  it("?days=N backfills, implies force, and is clamped to 1..90", () => {
    assert.deepEqual(parseCronParams(new URLSearchParams("days=7.9")), { days: 7, force: true });
    assert.deepEqual(parseCronParams(new URLSearchParams("days=365")), { days: 90, force: true });
    assert.deepEqual(parseCronParams(new URLSearchParams("days=0")), { days: null, force: false });
    assert.deepEqual(parseCronParams(new URLSearchParams("days=abc")), {
      days: null,
      force: false,
    });
  });
});

describe("runCronSync", () => {
  it("runs every configured source", async () => {
    const db = new FakeSupabase({
      profile: [
        { user_id: OWNER, key: "stock_watchlist", value: '["AAPL"]' },
        { user_id: OWNER, key: "sports_favorites", value: '[{"team_id":"1"}]' },
      ],
    });
    const { deps: d, calls } = deps();

    const results = await run(db, d);

    assert.deepEqual(results.oura, { usersSynced: 1, usersFailed: 0, errors: [] });
    assert.deepEqual(results.googleHealth, { usersSynced: 1, usersFailed: 0, errors: [] });
    assert.deepEqual(results.plex, { ok: "plex" });
    assert.deepEqual(results.stocks, { ok: "stocks" });
    assert.deepEqual(results.sports, { ok: "sports" });
    assert.deepEqual(calls.syncPlex, [[OWNER]]);
    assert.deepEqual(calls.syncStocks, [[OWNER, ["AAPL"]]]);
    assert.deepEqual(calls.syncOura, [[OWNER]], "no days arg without a backfill");
  });

  it("skips Plex (not an error) when PLEX_URL / PLEX_TOKEN are unset", async () => {
    for (const unset of ["PLEX_URL", "PLEX_TOKEN"]) {
      delete process.env[unset];
      const { deps: d, calls } = deps();
      const results = await run(new FakeSupabase(), d, { force: true });
      assert.deepEqual(results.plex, { skipped: true, reason: "PLEX_URL / PLEX_TOKEN not set" });
      assert.equal(calls.syncPlex, undefined, "syncPlex never called");
      process.env.PLEX_URL = "http://plex.test:32400";
      process.env.PLEX_TOKEN = "t";
    }
  });

  it("reports a Plex failure without losing the other sources' results", async () => {
    const db = new FakeSupabase({
      profile: [{ user_id: OWNER, key: "stock_watchlist", value: '["AAPL"]' }],
    });
    const { deps: d } = deps({
      syncPlex: () => {
        throw new Error("Plex /identity returned 401");
      },
    });

    const results = await run(db, d);

    assert.deepEqual(results.plex, { error: "Plex /identity returned 401" });
    assert.deepEqual(results.oura, { usersSynced: 1, usersFailed: 0, errors: [] });
    assert.deepEqual(results.googleHealth, { usersSynced: 1, usersFailed: 0, errors: [] });
    assert.deepEqual(results.stocks, { ok: "stocks" });
    assert.deepEqual(results.sports, { skipped: true, reason: "no favorites" });
  });

  it("isolates a failing user within a provider", async () => {
    const { deps: d } = deps({
      listConnectedUsers: () => ["a", "b"],
      syncOura: (_db: unknown, uid: unknown) => {
        if (uid === "b") throw new Error("token revoked");
        return {};
      },
    });
    const results = await run(new FakeSupabase(), d);
    assert.deepEqual(results.oura, {
      usersSynced: 1,
      usersFailed: 1,
      errors: [{ userId: "b", error: "token revoked" }],
    });
  });

  it("skips a source synced within 30 minutes unless forced", async () => {
    const { deps: d, calls } = deps({ lastSyncAgeSecs: () => 60 });
    const results = await run(new FakeSupabase(), d);
    assert.deepEqual(results.oura, { skipped: true, ageSecs: 60 });
    assert.deepEqual(results.googleHealth, { skipped: true, ageSecs: 60 });
    assert.deepEqual(results.plex, { skipped: true, ageSecs: 60 });
    assert.equal(calls.syncOura, undefined);

    const forced = deps({ lastSyncAgeSecs: () => 60 });
    const r2 = await run(new FakeSupabase(), forced.deps, { force: true, days: 14 });
    assert.deepEqual(r2.plex, { ok: "plex" });
    assert.deepEqual(forced.calls.syncOura, [[OWNER, 14]], "backfill days passed through");
  });

  it("purges notifications older than 30 days", async () => {
    const old = new Date(Date.now() - 31 * 86_400_000).toISOString();
    const recent = new Date(Date.now() - 86_400_000).toISOString();
    const db = new FakeSupabase({
      notifications: [
        { id: "n-old", sent_at: old },
        { id: "n-new", sent_at: recent },
      ],
    });
    await run(db, deps().deps);
    assert.deepEqual(
      db.table("notifications").map((n) => n.id),
      ["n-new"],
    );
  });
});
