// Unit tests for workout dedup (lib/sync/workout-dedupe.ts) — the single implementation.
// Run with: node --experimental-strip-types --test src/__tests__/google-health-dedupe.test.ts
// (from the web/ directory)
//
// WHY THIS EXISTS
//
// Google Health aggregates several writers — watch, phone, connected apps — and routinely
// reports one activity twice in a single response: once from the writer holding the HR
// sensor, with hr_zones populated, and once as a coarse copy with hr_zones null and a wild
// calorie figure.
//
// Before 2026-08-05 the ±5 min overlap check compared each incoming row only against rows
// already stored, never against rows accepted earlier in the same batch. For a same-batch
// pair neither copy was stored yet when the other was judged, so both were inserted. The
// implementation was a .filter(), which structurally cannot accumulate.
//
// Nothing errored. Active-calorie totals just drifted upward:
//   2026-07-31  one 13-minute walk stored twice, at 84 and 467 kcal
//   2026-07-31  one basketball game stored three times — 431 + 792 + 454 = 1677 kcal
//   2026-08-02  a phantom 295-minute "Cardio Workout" worth 1867 kcal (the watch reading
//               alcohol-elevated resting HR as five hours of exercise)
// 2026-07-31 totalled 2963 active calories against a *weekly* goal of 2500. Inflated
// active calories make a surplus look like a deficit, which is the number the coaching
// loop reads.
//
// If this regresses nothing throws and the numbers quietly inflate again, so it needs a
// test. This file is the ported successor to the deleted tests/test_google_health_dedupe.py:
// the Python sync it covered was removed when the two sync implementations were merged
// into one, and this is now the only dedup implementation in the codebase.

import assert from "node:assert/strict";
import { test } from "node:test";

import { filterNewWorkouts, type StoredWorkout } from "../lib/sync/workout-dedupe.ts";

function stored(
  date: string,
  start: string | null,
  activity: string,
  source = "google_health",
): StoredWorkout & { source: string } {
  return {
    id: `${date}-${start}-${activity}`,
    date,
    start_time: start,
    activity,
    avg_hr: null,
    duration_mins: 30,
    source,
  };
}

function incoming(
  date: string,
  start: string | null,
  activity: string,
  extra: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    date,
    start_time: start,
    activity,
    _key: `${date}|${start}|${activity}`,
    ...extra,
  };
}

const starts = (rows: Record<string, unknown>[]) => rows.map((r) => r.start_time);

// ---------------------------------------------------------------------------
// The regression: both copies arrive together, so neither is stored yet.
// ---------------------------------------------------------------------------

test("basketball pair 65 seconds apart keeps one", () => {
  // The real 2026-07-31 rows: 13:12:00 (no HR zones) and 13:13:05 (Peak 41m).
  const kept = filterNewWorkouts(
    [],
    [
      incoming("2026-07-31", "13:12:00", "Basketball", { calories: 431 }),
      incoming("2026-07-31", "13:13:05", "Basketball", { calories: 792 }),
    ],
  );
  assert.equal(kept.length, 1, `expected 1 row, got ${JSON.stringify(starts(kept))}`);
  assert.equal(kept[0].start_time, "13:12:00");
});

test("walk pair three minutes apart keeps one", () => {
  // 2026-07-31 again: 13 minutes of walking stored as 84 kcal and 467 kcal.
  const kept = filterNewWorkouts(
    [],
    [
      incoming("2026-07-31", "12:59:54", "Walk", { calories: 84 }),
      incoming("2026-07-31", "13:03:00", "Walk", { calories: 467 }),
    ],
  );
  assert.equal(kept.length, 1, `expected 1 row, got ${JSON.stringify(starts(kept))}`);
});

test("three copies collapse to one", () => {
  const kept = filterNewWorkouts(
    [],
    [
      incoming("2026-07-31", "13:12:00", "Basketball"),
      incoming("2026-07-31", "13:13:05", "Basketball"),
      incoming("2026-07-31", "13:14:10", "Basketball"),
    ],
  );
  assert.equal(kept.length, 1, `expected 1 row, got ${JSON.stringify(starts(kept))}`);
});

// ---------------------------------------------------------------------------
// Negative cases — the fix must not collapse legitimately distinct sessions.
// ---------------------------------------------------------------------------

test("genuinely separate sessions on one day both survive", () => {
  const kept = filterNewWorkouts(
    [],
    [
      incoming("2026-07-31", "09:54:31", "Cardio Workout"),
      incoming("2026-07-31", "15:36:22", "Cardio Workout"),
    ],
  );
  assert.equal(kept.length, 2, `expected 2 rows, got ${JSON.stringify(starts(kept))}`);
});

test("same clock time on different dates both survive", () => {
  const kept = filterNewWorkouts(
    [],
    [
      incoming("2026-07-30", "13:12:00", "Basketball"),
      incoming("2026-07-31", "13:12:00", "Basketball"),
    ],
  );
  assert.equal(kept.length, 2, `expected 2 rows, got ${JSON.stringify(starts(kept))}`);
});

// KNOWN LIMITATION, asserted here so it is a decision rather than a surprise.
//
// The overlap index is keyed by DATE ONLY, not date+activity, so two DIFFERENT activities
// starting within 5 minutes of each other collapse to one — e.g. walking to the court at
// 13:12 and starting basketball at 13:12 loses the second session. The exact-key dedup
// above does consider activity; this second pass does not. Behaviour predates the
// 2026-08-05 rewrite (the deleted Python sync indexed by date only too) and is deliberately
// left alone: narrowing the key to date+activity would stop collapsing real sessions, but
// would also re-admit duplicates whenever two writers label the same session differently
// ("Walk" vs "Cardio Workout"), which is a live pattern in the 2026-07-31 data. Changing it
// is a semantic decision about dedup, not a refactor, and belongs in its own change.
test("different activities at the same moment collapse — known limitation", () => {
  const kept = filterNewWorkouts(
    [],
    [incoming("2026-07-31", "13:12:00", "Walk"), incoming("2026-07-31", "13:12:00", "Basketball")],
  );
  assert.equal(
    kept.length,
    1,
    `expected 1 row (date-only index), got ${JSON.stringify(starts(kept))}`,
  );
  assert.equal(kept[0].activity, "Walk", "the first row wins");
});

test("exactly at the window edge is treated as overlapping", () => {
  const kept = filterNewWorkouts(
    [],
    [
      incoming("2026-07-31", "13:00:00", "Walk"),
      incoming("2026-07-31", "13:05:00", "Walk"), // 5 min — inclusive bound
    ],
  );
  assert.equal(kept.length, 1, `expected 1 row, got ${JSON.stringify(starts(kept))}`);
});

test("just outside the window survives", () => {
  const kept = filterNewWorkouts(
    [],
    [incoming("2026-07-31", "13:00:00", "Walk"), incoming("2026-07-31", "13:06:00", "Walk")],
  );
  assert.equal(kept.length, 2, `expected 2 rows, got ${JSON.stringify(starts(kept))}`);
});

// ---------------------------------------------------------------------------
// Manual rows participate: a hand-logged session is the same real workout.
// ---------------------------------------------------------------------------

test("a stored manual row suppresses the auto-import", () => {
  const db = [stored("2026-07-31", "13:13:05", "Basketball", "manual")];
  const kept = filterNewWorkouts(db, [incoming("2026-07-31", "13:12:00", "Basketball")]);
  assert.deepEqual(kept, [], "the manual row should have suppressed it");
});

// ---------------------------------------------------------------------------
// Pre-existing guarantees must survive the refactor.
// ---------------------------------------------------------------------------

test("exact key match is dropped", () => {
  const db = [stored("2026-07-31", "13:13:05", "Basketball")];
  const kept = filterNewWorkouts(db, [incoming("2026-07-31", "13:13:05", "Basketball")]);
  assert.deepEqual(kept, []);
});

test("a stored row suppresses a near neighbour", () => {
  const db = [stored("2026-07-31", "13:13:05", "Basketball")];
  const kept = filterNewWorkouts(db, [incoming("2026-07-31", "13:12:00", "Basketball")]);
  assert.deepEqual(kept, []);
});

test("null start_time is not treated as overlapping everything", () => {
  const kept = filterNewWorkouts(
    [],
    [incoming("2026-07-31", null, "Basketball"), incoming("2026-07-31", "13:12:00", "Basketball")],
  );
  assert.equal(kept.length, 2, `expected both kept, got ${JSON.stringify(starts(kept))}`);
});

test("empty batch", () => {
  assert.deepEqual(filterNewWorkouts([], []), []);
});
