// Unit tests for the contextual journal prompt engine (lib/journal/prompts.ts).
// Run with: node --experimental-strip-types --test src/__tests__/journal-prompts.test.ts
// (from the web/ directory)
//
// WHY THIS EXISTS
//
// The journal used to be five fixed questions. It is now one free-write box with up to three
// suggestions derived from the day's own data — so the suggestions ARE the feature, and a wrong
// one is worse than none: it tells the user something untrue about their own day before they've
// written a word. "You trained today" on a day they didn't train is not a cosmetic bug.
//
// That exact failure shipped once already and was caught only by running the engine against live
// rows. Session classification asked whether EVERY exercise name contained "grease-the-groove".
// A GtG walk logs this:
//
//   Pull-ups (grease-the-groove) | Chin-ups (grease-the-groove) | Negative Pull-Up | Dead Hang
//
// Two of the four carry no suffix, so `every` returned false and four consecutive pull-up-only
// days (8/04 through 8/07) were classified as lifting sessions. GtG is deliberately kept OUT of
// lifting sessions, so `any` is both correct and sufficient. The first test below pins that.
//
// The alcohol rules get the most coverage because they are the highest-stakes: they are the ones
// that can address a real problem, and also the ones that would be most alienating if they fired
// wrongly. The ordering rule that matters is that an unlogged day must NOT be read as a dry day.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildJournalPrompts,
  isGreaseTheGrooveSession,
  MAX_PROMPTS,
  type JournalPromptContext,
} from "../lib/journal/prompts.ts";

const EMPTY: JournalPromptContext = {
  today: "2026-08-07",
  alcohol: [],
  intake: [],
  recovery: [],
  strength: [],
  weights: [],
  habits: [],
  lastEntryDate: null,
  calorieGoal: 1800,
  proteinGoal: 150,
};

const ctx = (over: Partial<JournalPromptContext> = {}): JournalPromptContext => ({
  ...EMPTY,
  ...over,
});

const ids = (c: JournalPromptContext) => buildJournalPrompts(c).map((p) => p.id);

// --- session classification — the bug that shipped --------------------------

test("a GtG session is recognised despite unsuffixed accessory movements", () => {
  assert.equal(
    isGreaseTheGrooveSession([
      "Pull-ups (grease-the-groove)",
      "Chin-ups (grease-the-groove)",
      "Negative Pull-Up",
      "Dead Hang",
    ]),
    true,
  );
});

test("a lifting session is not mistaken for GtG", () => {
  assert.equal(
    isGreaseTheGrooveSession(["DB Goblet Squat", "Plank", "DB Chest Press (floor)"]),
    false,
  );
});

test("a session with no sets logged is not GtG", () => {
  assert.equal(isGreaseTheGrooveSession([]), false);
});

test("a GtG day does not produce a training prompt", () => {
  const c = ctx({
    strength: [{ performed_on: "2026-08-07", perceived_effort: null, isGreaseTheGroove: true }],
  });
  assert.ok(!ids(c).some((id) => id.startsWith("training-")));
});

test("a real lift does produce a training prompt, and hard sessions rank higher", () => {
  const easy = ctx({
    strength: [{ performed_on: "2026-08-07", perceived_effort: 6, isGreaseTheGroove: false }],
  });
  const hard = ctx({
    strength: [{ performed_on: "2026-08-07", perceived_effort: 9, isGreaseTheGroove: false }],
  });
  assert.ok(ids(easy).includes("training-session"));
  assert.ok(ids(hard).includes("training-hard-session"));
});

// --- alcohol ---------------------------------------------------------------

test("drinking today outranks everything else", () => {
  const c = ctx({
    alcohol: [{ date: "2026-08-07", completed: false }],
    strength: [{ performed_on: "2026-08-07", perceived_effort: 9, isGreaseTheGroove: false }],
  });
  assert.equal(buildJournalPrompts(c)[0].id, "alcohol-today");
});

test("dry today after a drinking day asks what was different", () => {
  const c = ctx({
    alcohol: [
      { date: "2026-08-06", completed: false },
      { date: "2026-08-07", completed: true },
    ],
  });
  assert.ok(ids(c).includes("alcohol-dry-after-heavy"));
});

test("an unlogged today is NOT treated as a dry day", () => {
  // The habit is marked when the day is called, which is usually after journalling.
  // Claiming "today was dry" off a missing row would be asserting something unknown.
  const c = ctx({ alcohol: [{ date: "2026-08-06", completed: false }] });
  const got = ids(c);
  assert.ok(got.includes("alcohol-yesterday-only"));
  assert.ok(!got.includes("alcohol-dry-after-heavy"));
});

test("a dry run of three or more is counted and named", () => {
  const c = ctx({
    alcohol: [
      { date: "2026-08-05", completed: true },
      { date: "2026-08-06", completed: true },
      { date: "2026-08-07", completed: true },
    ],
  });
  const prompt = buildJournalPrompts(c).find((p) => p.id === "alcohol-dry-run");
  assert.ok(prompt, "expected a dry-run prompt");
  assert.match(prompt.text, /^3 dry days/);
});

test("a one-day dry run is not worth remarking on", () => {
  const c = ctx({ alcohol: [{ date: "2026-08-07", completed: true }] });
  assert.ok(!ids(c).includes("alcohol-dry-run"));
});

// --- habit streaks ---------------------------------------------------------

test("a broken streak fires only when a real streak was running", () => {
  const rows = (dates: [string, boolean][]) =>
    dates.map(([date, completed]) => ({ name: "Floss", date, completed }));

  const broke = ctx({
    habits: rows([
      ["2026-08-02", true],
      ["2026-08-03", true],
      ["2026-08-04", true],
      ["2026-08-05", true],
      ["2026-08-06", false],
    ]),
  });
  const prompt = buildJournalPrompts(broke).find((p) => p.id === "habit-streak-Floss");
  assert.ok(prompt, "expected a streak-break prompt");
  assert.match(prompt.text, /4-day streak/);

  const neverKept = ctx({
    habits: rows([
      ["2026-08-05", true],
      ["2026-08-06", false],
    ]),
  });
  assert.ok(!ids(neverKept).includes("habit-streak-Floss"));
});

// --- recovery and weight ---------------------------------------------------

test("an HRV collapse is reported against the recent baseline", () => {
  const c = ctx({
    recovery: [
      { date: "2026-08-03", readiness: 80, avg_hrv: 70, resting_hr: 54, total_sleep_hrs: 8 },
      { date: "2026-08-04", readiness: 80, avg_hrv: 70, resting_hr: 54, total_sleep_hrs: 8 },
      { date: "2026-08-07", readiness: 60, avg_hrv: 22, resting_hr: 69, total_sleep_hrs: 7 },
    ],
  });
  assert.ok(ids(c).includes("recovery-hrv-down"));
});

test("a fast weight swing is named as water, not fat", () => {
  const c = ctx({
    weights: [
      { date: "2026-08-05", weight_lb: 153.0 },
      { date: "2026-08-07", weight_lb: 155.4 },
    ],
  });
  const prompt = buildJournalPrompts(c).find((p) => p.id === "weight-swing");
  assert.ok(prompt, "expected a weight-swing prompt");
  assert.match(prompt.text, /water, not fat/);
});

test("a weight change under the threshold is ignored", () => {
  const c = ctx({
    weights: [
      { date: "2026-08-05", weight_lb: 153.9 },
      { date: "2026-08-07", weight_lb: 154.3 },
    ],
  });
  assert.ok(!ids(c).includes("weight-swing"));
});

// --- output contract -------------------------------------------------------

test("never returns more than MAX_PROMPTS, highest priority first", () => {
  const c = ctx({
    alcohol: [
      { date: "2026-08-06", completed: false },
      { date: "2026-08-07", completed: true },
    ],
    strength: [{ performed_on: "2026-08-07", perceived_effort: 9, isGreaseTheGroove: false }],
    weights: [
      { date: "2026-08-05", weight_lb: 153.0 },
      { date: "2026-08-07", weight_lb: 155.4 },
    ],
    lastEntryDate: "2026-07-01",
    recovery: [
      { date: "2026-08-06", readiness: 93, avg_hrv: 71, resting_hr: 53, total_sleep_hrs: 11.35 },
    ],
  });
  const got = buildJournalPrompts(c);
  assert.equal(got.length, MAX_PROMPTS);
  const priorities = got.map((p) => p.priority);
  assert.deepEqual(
    priorities,
    [...priorities].sort((a, b) => b - a),
  );
});

test("an empty context still returns a full set of evergreen prompts", () => {
  const got = buildJournalPrompts(EMPTY);
  assert.equal(got.length, MAX_PROMPTS);
  assert.ok(got.every((p) => p.id.startsWith("evergreen-")));
});

test("evergreen prompts are stable within a day and rotate across days", () => {
  const a = ids(ctx({ today: "2026-08-07" }));
  assert.deepEqual(a, ids(ctx({ today: "2026-08-07" })), "same day must be stable");
  assert.notDeepEqual(a, ids(ctx({ today: "2026-08-08" })), "next day must differ");
});

test("prompt ids are unique within a result set", () => {
  const got = ids(
    ctx({
      alcohol: [{ date: "2026-08-07", completed: false }],
      habits: [
        { name: "Floss", date: "2026-08-03", completed: true },
        { name: "Floss", date: "2026-08-04", completed: true },
        { name: "Floss", date: "2026-08-05", completed: true },
        { name: "Floss", date: "2026-08-06", completed: false },
      ],
    }),
  );
  assert.equal(new Set(got).size, got.length);
});
