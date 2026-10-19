// Contract tests for the log_drink and log_measurement MCP tools (lib/tools/program-actions.ts).
// Run with: node --experimental-strip-types --test src/__tests__/program-tools.test.ts
// (from the web/ directory)

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { logDrink, logMeasurement } from "../lib/tools/program-actions.ts";
import { FakeSupabase, type Row } from "./helpers/fake-supabase.ts";

const USER = "user-1";
const TODAY = "2030-06-15";
const NO_ALC = { id: "h-dry", user_id: USER, name: "No Alcohol", active: true };

describe("log_drink", () => {
  it("writes a snack row priced by ethanol arithmetic plus label carbs", async () => {
    const db = new FakeSupabase({ habit_registry: [NO_ALC] });
    const res = await logDrink(db.client, USER, TODAY, {
      beverage: "Test lager",
      volume_ml: 355,
      abv_pct: 5,
      carbs_g: 10,
      origin: "restaurant",
    });
    assert.equal(res.ok, true);
    const row = db.table("meal_log")[0];
    assert.equal(row.date, TODAY);
    assert.equal(row.meal_type, "snack");
    assert.equal(row.standard_drinks, 1);
    assert.equal(row.calories, 98 + 40);
    assert.equal(row.protein_g, 0);
    assert.equal(row.fat_g, 0);
    assert.equal(row.carbs_g, 10);
    assert.equal(row.source, "drink_calc");
    assert.equal(row.origin, "restaurant");
    assert.equal(row.notes, "Test lager");
  });

  it("marks the No Alcohol habit missed on the three-column conflict target", async () => {
    const db = new FakeSupabase({
      habit_registry: [NO_ALC],
      habits: [{ user_id: USER, habit_id: "h-dry", date: "2030-06-14", completed: true }],
    });
    await logDrink(db.client, USER, TODAY, {
      date: "2030-06-14",
      beverage: "Wine",
      volume_ml: 150,
      abv_pct: 12,
    });
    const habit = db.table("habits")[0] as Row;
    assert.equal(habit.completed, false);
    const upsert = db.calls.find((c) => c.table === "habits" && c.op === "upsert");
    assert.equal(upsert?.options?.onConflict, "user_id,habit_id,date");
  });

  it("still logs the drink when the user has no No Alcohol habit", async () => {
    const db = new FakeSupabase({});
    const res = await logDrink(db.client, USER, TODAY, {
      beverage: "Cider",
      volume_ml: 330,
      abv_pct: 4.5,
    });
    assert.equal(res.ok, true);
    assert.equal((res as { habit: string | null }).habit, null);
    assert.equal(db.table("meal_log").length, 1);
  });

  it("rejects bad input before writing anything", async () => {
    const db = new FakeSupabase({ habit_registry: [NO_ALC] });
    const bad = [
      { beverage: "x", volume_ml: -1, abv_pct: 5 },
      { beverage: "x", volume_ml: 100, abv_pct: 120 },
      { beverage: "x", volume_ml: 100, abv_pct: 5, origin: "moon" },
      { beverage: "", volume_ml: 100, abv_pct: 5 },
      { beverage: "x", volume_ml: 100, abv_pct: 5, date: "June 1" },
    ];
    for (const input of bad) {
      const res = await logDrink(db.client, USER, TODAY, input);
      assert.equal(res.ok, false, JSON.stringify(input));
    }
    assert.equal(db.calls.length, 0);
  });

  it("reports a failed insert as a failure", async () => {
    const db = new FakeSupabase({});
    db.failures.set("meal_log:insert", "boom");
    const res = await logDrink(db.client, USER, TODAY, {
      beverage: "x",
      volume_ml: 100,
      abv_pct: 5,
    });
    assert.deepEqual(res, { ok: false, error: "boom" });
  });
});

describe("log_measurement", () => {
  it("upserts one row per date and keeps the waist when only notes are re-logged", async () => {
    const db = new FakeSupabase({});
    const first = await logMeasurement(db.client, USER, TODAY, { waist_in: 33.25 });
    assert.equal(first.ok, true);
    await logMeasurement(db.client, USER, TODAY, { notes: "after breakfast" });
    const rows = db.table("body_measurements");
    assert.equal(rows.length, 1);
    assert.equal(rows[0].waist_in, 33.3);
    assert.equal(rows[0].notes, "after breakfast");
    const upsert = db.calls.find((c) => c.op === "upsert");
    assert.equal(upsert?.options?.onConflict, "user_id,date");
  });

  it("rejects a value that reads as centimetres", async () => {
    const db = new FakeSupabase({});
    const res = await logMeasurement(db.client, USER, TODAY, { waist_in: 86 });
    assert.equal(res.ok, false);
    assert.equal(db.calls.length, 0);
  });
});
