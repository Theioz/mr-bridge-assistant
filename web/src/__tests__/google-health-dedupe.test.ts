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

// ---------------------------------------------------------------------------
// Pass 2 — zoneless copies that land OUTSIDE the ±5 min window.
//
// #657 (2026-08-05) fixed the intra-batch blindness above and the pairs kept coming: 13 more
// between 2026-08-06 and 2026-09-08, worth 1,729 phantom kcal and 8.6 hours. The ±5 min window
// was too narrow — these copies land 6-19 minutes after their twin, not the "seconds to ~3 min"
// the 2026-08-05 sweep had seen. Widening OVERLAP_MINS is not the fix: Jason walks twice in an
// afternoon (2026-08-24, two real walks 34 min apart; 2026-08-28, four). Wall-clock overlap is
// the honest test, and the rows carry the durations needed to compute it.
//
// Fixtures below are the real rows, by id, from the 2026-09-09 audit.
// ---------------------------------------------------------------------------

function gh(
  date: string,
  start: string,
  activity: string,
  durationMins: number,
  calories: number,
  hrZones: string | null,
): Record<string, unknown> {
  return {
    date,
    start_time: start,
    activity,
    duration_mins: durationMins,
    calories,
    metadata: { hr_zones: hrZones },
    _key: `${date}|${start}|${activity}`,
  };
}

function storedGh(
  date: string,
  start: string,
  activity: string,
  durationMins: number,
): StoredWorkout {
  return {
    id: `${date}-${start}`,
    date,
    start_time: start,
    activity,
    avg_hr: null,
    duration_mins: durationMins,
  };
}

test("the 2026-09-08 pair collapses — 8 min apart, 92 min of overlap", () => {
  // 5fa09b12 (100 min / 696 kcal, zones) and ae93aceb (102 min / 377 kcal, no zones).
  // One 1h40m walk. Reported by Jason 2026-09-09: "we didn't do 202 minutes of walking".
  const kept = filterNewWorkouts(
    [],
    [
      gh("2026-09-08", "13:34:14", "Walk", 100, 696, "Moderate: 8m | Light: 92m"),
      gh("2026-09-08", "13:42:00", "Walk", 102, 377, null),
    ],
  );
  assert.equal(kept.length, 1, `expected 1 row, got ${JSON.stringify(starts(kept))}`);
  assert.equal(kept[0].start_time, "13:34:14", "the row holding the HR sensor survives");
});

test("batch order does not matter — the zoneless copy is judged last", () => {
  const kept = filterNewWorkouts(
    [],
    [
      gh("2026-09-08", "13:42:00", "Walk", 102, 377, null),
      gh("2026-09-08", "13:34:14", "Walk", 100, 696, "Moderate: 8m | Light: 92m"),
    ],
  );
  assert.equal(kept.length, 1, `expected 1 row, got ${JSON.stringify(starts(kept))}`);
  assert.equal(kept[0].start_time, "13:34:14");
});

test("a stored genuine row suppresses a zoneless copy arriving later", () => {
  // The 7-day lookback re-offers 2026-09-06 every night; the copy must not come back.
  const kept = filterNewWorkouts(
    [storedGh("2026-09-06", "11:43:33", "Walk", 51)],
    [gh("2026-09-06", "11:53:00", "Walk", 41, 155, null)],
  );
  assert.deepEqual(kept, [], "876dc9ac should have been suppressed");
});

test("a zoneless copy wearing a different activity label still collapses", () => {
  // 2026-08-07: the phone logged the 08:55 Treadmill run as a 09:14 Walk nested inside it.
  const kept = filterNewWorkouts(
    [],
    [
      gh("2026-08-07", "08:55:08", "Treadmill", 36, 304, "Vigorous: 30m | Moderate: 6m"),
      gh("2026-08-07", "09:14:00", "Walk", 13, 71, null),
    ],
  );
  assert.equal(kept.length, 1, `expected 1 row, got ${JSON.stringify(starts(kept))}`);
  assert.equal(kept[0].activity, "Treadmill");
});

test("a zoneless copy that STARTS FIRST and runs longer still collapses", () => {
  // 2026-09-01: f90f743c is 12:32 / 95 min / 206 kcal; the genuine 0382a9b8 is 12:51 / 75 min /
  // 398 kcal. Neither longest-duration nor earliest-start picks the right row here.
  const kept = filterNewWorkouts(
    [],
    [
      gh("2026-09-01", "12:32:00", "Walk", 95, 206, null),
      gh("2026-09-01", "12:51:05", "Walk", 75, 398, "Light: 75m"),
    ],
  );
  assert.equal(kept.length, 1, `expected 1 row, got ${JSON.stringify(starts(kept))}`);
  assert.equal(kept[0].start_time, "12:51:05", "the kcal-coherent row survives");
});

test("every one of the 13 audited pairs collapses", () => {
  // date, genuine [start, mins], copy [start, mins]
  const pairs: [string, [string, number], [string, number]][] = [
    ["2026-08-06", ["12:33:05", 32], ["12:41:00", 26]],
    ["2026-08-07", ["08:55:08", 36], ["09:14:00", 13]],
    ["2026-08-07", ["12:32:08", 29], ["12:40:00", 23]],
    ["2026-08-12", ["14:38:05", 20], ["14:44:00", 14]],
    ["2026-08-13", ["13:07:35", 49], ["13:15:00", 42]],
    ["2026-08-14", ["14:00:34", 47], ["14:09:00", 39]],
    ["2026-08-17", ["13:47:36", 53], ["13:55:00", 41]],
    ["2026-08-24", ["14:35:42", 66], ["14:47:00", 40]],
    ["2026-08-29", ["12:36:21", 80], ["13:23:00", 28]],
    ["2026-08-29", ["18:46:00", 338], ["18:56:00", 11]],
    ["2026-09-01", ["12:51:05", 75], ["12:32:00", 95]],
    ["2026-09-06", ["11:43:33", 51], ["11:53:00", 41]],
    ["2026-09-08", ["13:34:14", 100], ["13:42:00", 102]],
  ];
  for (const [date, [gs, gd], [cs, cd]] of pairs) {
    const kept = filterNewWorkouts(
      [],
      [gh(date, gs, "Walk", gd, 300, "Light: 20m"), gh(date, cs, "Walk", cd, 100, null)],
    );
    assert.equal(kept.length, 1, `${date} ${cs}: expected 1, got ${JSON.stringify(starts(kept))}`);
    assert.equal(kept[0].start_time, gs, `${date}: wrong row survived`);
  }
});

// ---------------------------------------------------------------------------
// Pass 2 negative cases — zoneless is not by itself a verdict.
// ---------------------------------------------------------------------------

test("zoneless rows that overlap nothing survive", () => {
  // The other class found in the audit: 15 standalone low-fidelity rows, 10-39 min at
  // 2-3 kcal/min, no twin anywhere. Passive step detection, not a copy. Left alone.
  const kept = filterNewWorkouts(
    [],
    [
      gh("2026-08-31", "08:57:00", "Walk", 39, 85, null),
      gh("2026-08-31", "13:00:00", "Walk", 10, 30, null),
      gh("2026-08-31", "13:33:04", "Walk", 79, 419, "Light: 79m"),
      gh("2026-08-31", "15:17:26", "Walk", 78, 447, "Light: 78m"),
    ],
  );
  assert.equal(kept.length, 4, `expected all 4, got ${JSON.stringify(starts(kept))}`);
});

test("two zoneless rows that do not overlap each other both survive", () => {
  // 2026-08-20: 08dc07d9 (10:01, 13 min) and eae07c7f (10:42, 15 min). Genuine walk at 13:36.
  const kept = filterNewWorkouts(
    [],
    [
      gh("2026-08-20", "10:01:00", "Walk", 13, 33, null),
      gh("2026-08-20", "10:42:00", "Walk", 15, 31, null),
      gh("2026-08-20", "13:36:07", "Walk", 45, 324, "Light: 45m"),
    ],
  );
  assert.equal(kept.length, 3, `expected all 3, got ${JSON.stringify(starts(kept))}`);
});

test("a zoneless row merely brushing a session's tail survives", () => {
  // 20 min starting 10 min before a session ends: 10 min of overlap, exactly at the ratio
  // bound but not over it on the copy's own duration.
  const kept = filterNewWorkouts(
    [],
    [
      gh("2026-08-28", "11:30:14", "Walk", 61, 497, "Vigorous: 61m"),
      gh("2026-08-28", "12:22:00", "Walk", 20, 60, null),
    ],
  );
  assert.equal(kept.length, 2, `expected 2 rows, got ${JSON.stringify(starts(kept))}`);
});

test("a row with no metadata at all is not treated as zoneless", () => {
  // Absence of the field is not evidence of absent zones. Manual rows carry no hr_zones.
  const kept = filterNewWorkouts(
    [storedGh("2026-08-15", "10:00:00", "Walk", 60)],
    [incoming("2026-08-15", "10:30:00", "Walk", { duration_mins: 20 })],
  );
  assert.equal(kept.length, 1, "pass 2 must not fire without an explicit hr_zones");
});

test("a zoneless row with no duration falls through to the ±5 min rule", () => {
  const kept = filterNewWorkouts(
    [storedGh("2026-08-15", "10:00:00", "Walk", 60)],
    [gh("2026-08-15", "10:30:00", "Walk", 0, 40, null)],
  );
  assert.equal(kept.length, 1, "no interval to compare, and 30 min is outside ±5");
});
