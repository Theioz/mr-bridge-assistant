// Unit tests for the shared weekly habit-completion calculation (lib/habits/weekly-completion.ts).
// Run with: node --experimental-strip-types --test src/__tests__/weekly-completion.test.ts
// (from the web/ directory)
//
// WHY THIS EXISTS
//
// On 2026-10-12 /habits showed "0%" over "3/28" for the week, and /weekly showed "0/28 · 0%" for
// the same Oct 6–12. Each page had its own copy of this arithmetic and its own date window, so
// nothing forced them to agree. Both pages now call `weeklyCompletion` with the same
// user-timezone `days` list; these tests pin the rules they share.

import assert from "node:assert/strict";
import { test } from "node:test";
import { completionPct, weeklyCompletion } from "../lib/habits/weekly-completion.ts";

const DAYS = [
  "2026-10-06",
  "2026-10-07",
  "2026-10-08",
  "2026-10-09",
  "2026-10-10",
  "2026-10-11",
  "2026-10-12",
];
const HABITS = ["a", "b", "c", "d"];

test("3 of 28 is 11%, not 0% — the 2026-10-12 walkthrough numbers", () => {
  const logs = [
    { habit_id: "a", date: "2026-10-12", completed: true },
    { habit_id: "b", date: "2026-10-12", completed: true },
    { habit_id: "c", date: "2026-10-11", completed: true },
  ];
  const w = weeklyCompletion(HABITS, logs, DAYS);
  assert.equal(w.completed, 3);
  assert.equal(w.possible, 28);
  assert.equal(w.pct, 11);
});

test("pct agrees with completed/possible at the rounding edges", () => {
  assert.equal(completionPct(0, 28), 0);
  assert.equal(completionPct(1, 28), 4);
  assert.equal(completionPct(28, 28), 100);
  assert.equal(completionPct(0, 0), 0);
});

test("a duplicate row for the same habit and day is one hit", () => {
  const logs = [
    { habit_id: "a", date: "2026-10-12", completed: true },
    { habit_id: "a", date: "2026-10-12", completed: true },
  ];
  assert.equal(weeklyCompletion(HABITS, logs, DAYS).completed, 1);
});

test("logs outside the window, for inactive habits, or not completed do not count", () => {
  const logs = [
    { habit_id: "a", date: "2026-10-05", completed: true }, // day before the window
    { habit_id: "a", date: "2026-10-13", completed: true }, // tomorrow (a UTC-dated row)
    { habit_id: "zz", date: "2026-10-12", completed: true }, // archived habit
    { habit_id: "b", date: "2026-10-12", completed: false },
    { habit_id: "c", date: "2026-10-12", completed: null },
  ];
  const w = weeklyCompletion(HABITS, logs, DAYS);
  assert.equal(w.completed, 0);
  assert.equal(w.possible, 28);
});

test("rows pre-filtered to completed may omit the column", () => {
  const w = weeklyCompletion(HABITS, [{ habit_id: "d", date: "2026-10-06" }], DAYS);
  assert.equal(w.completed, 1);
});

test("both pages get the same answer from the same inputs", () => {
  // /habits passes full rows (select *), /weekly passes habit_id,date,completed. Extra columns
  // must not change the result.
  const narrow = [
    { habit_id: "a", date: "2026-10-12", completed: true },
    { habit_id: "b", date: "2026-10-09", completed: true },
  ];
  const wide = narrow.map((l, i) => ({ ...l, id: String(i), user_id: "u", notes: null }));
  assert.deepEqual(
    weeklyCompletion(HABITS, narrow, DAYS).pct,
    weeklyCompletion(HABITS, wide, DAYS).pct,
  );
});

test("perHabit keeps the caller's order and the dates hit", () => {
  const w = weeklyCompletion(
    ["b", "a"],
    [
      { habit_id: "a", date: "2026-10-07", completed: true },
      { habit_id: "a", date: "2026-10-08", completed: true },
    ],
    DAYS,
  );
  assert.deepEqual(
    w.perHabit.map((h) => [h.habitId, h.days]),
    [
      ["b", 0],
      ["a", 2],
    ],
  );
  assert.ok(w.perHabit[1].dates.has("2026-10-08"));
});
