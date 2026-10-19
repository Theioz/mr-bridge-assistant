// Steps → habit auto-complete, run by the Oura sync (lib/sync/steps-habit.ts).
// Run with: node --experimental-strip-types --test src/__tests__/steps-habit.test.ts
// (from the web/ directory)

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  autoCompleteStepsHabit,
  datesMeetingStepsGoal,
  stepsGoalFrom,
} from "../lib/sync/steps-habit.ts";
import { FakeSupabase } from "./helpers/fake-supabase.ts";

const USER = "user-1";
const HABIT = { id: "h-steps", user_id: USER, name: "10,000 Steps", active: true };

describe("datesMeetingStepsGoal", () => {
  it("keeps dates at or above the goal, sorted, and drops nulls", () => {
    const rows = [
      { date: "2030-01-03", steps: 12000 },
      { date: "2030-01-01", steps: 10000 },
      { date: "2030-01-02", steps: 9999 },
      { date: "2030-01-04", steps: null },
    ];
    assert.deepEqual(datesMeetingStepsGoal(rows, 10000), ["2030-01-01", "2030-01-03"]);
  });

  it("de-duplicates a date seen twice", () => {
    const rows = [
      { date: "2030-01-01", steps: 11000 },
      { date: "2030-01-01", steps: 15000 },
    ];
    assert.deepEqual(datesMeetingStepsGoal(rows, 10000), ["2030-01-01"]);
  });
});

describe("stepsGoalFrom", () => {
  it("defaults to 10000 when unset, blank or invalid", () => {
    for (const raw of [undefined, null, "", "abc", "0", "-5"]) {
      assert.equal(stepsGoalFrom(raw), 10000, String(raw));
    }
    assert.equal(stepsGoalFrom("8000"), 8000);
  });
});

describe("autoCompleteStepsHabit", () => {
  it("inserts a completed row for a qualifying day with no row", async () => {
    const db = new FakeSupabase({ habit_registry: [HABIT] });
    const written = await autoCompleteStepsHabit(db.client, USER, [
      { date: "2030-01-01", steps: 10500 },
      { date: "2030-01-02", steps: 400 },
    ]);
    assert.deepEqual(written, ["2030-01-01"]);
    const rows = db.table("habits");
    assert.equal(rows.length, 1);
    assert.equal(rows[0].completed, true);
    assert.equal(rows[0].date, "2030-01-01");
  });

  it("flips an uncompleted row without touching its notes, and leaves a done row alone", async () => {
    const db = new FakeSupabase({
      habit_registry: [HABIT],
      habits: [
        { user_id: USER, habit_id: "h-steps", date: "2030-01-01", completed: false, notes: "n1" },
        { user_id: USER, habit_id: "h-steps", date: "2030-01-02", completed: true, notes: "n2" },
      ],
    });
    const written = await autoCompleteStepsHabit(db.client, USER, [
      { date: "2030-01-01", steps: 20000 },
      { date: "2030-01-02", steps: 20000 },
    ]);
    assert.deepEqual(written, ["2030-01-01"]);
    const rows = db.table("habits");
    assert.deepEqual(
      rows.map((r) => [r.date, r.completed, r.notes]),
      [
        ["2030-01-01", true, "n1"],
        ["2030-01-02", true, "n2"],
      ],
    );
  });

  it("never marks a low-step day incomplete", async () => {
    const db = new FakeSupabase({
      habit_registry: [HABIT],
      habits: [{ user_id: USER, habit_id: "h-steps", date: "2030-01-01", completed: true }],
    });
    await autoCompleteStepsHabit(db.client, USER, [{ date: "2030-01-01", steps: 10 }]);
    assert.equal(db.table("habits")[0].completed, true);
    assert.equal(
      db.calls.some((c) => c.table === "habits" && c.op !== "select"),
      false,
    );
  });

  it("honours profile.steps_goal", async () => {
    const db = new FakeSupabase({
      habit_registry: [HABIT],
      profile: [{ user_id: USER, key: "steps_goal", value: "6000" }],
    });
    const written = await autoCompleteStepsHabit(db.client, USER, [
      { date: "2030-01-01", steps: 7000 },
    ]);
    assert.deepEqual(written, ["2030-01-01"]);
  });

  it("skips silently when the user has no steps habit", async () => {
    const db = new FakeSupabase({});
    const written = await autoCompleteStepsHabit(db.client, USER, [
      { date: "2030-01-01", steps: 50000 },
    ]);
    assert.deepEqual(written, []);
    assert.equal(db.table("habits").length, 0);
  });
});
