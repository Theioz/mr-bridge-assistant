// Unit tests for the dashboard's Today's food rules: which planned meal is next, whether it can
// be logged in one tap, and today's macro totals/targets.
// Run with: node --experimental-strip-types --test src/__tests__/next-meal.test.ts
// (from the web/ directory)

import assert from "node:assert/strict";
import { test } from "node:test";
import { eatTargetFor, pickNextPlannedMeal } from "../lib/nutrition/next-meal.ts";
import { macroGoalsFromProfile, sumMacroTotals } from "../lib/nutrition/daily-macros.ts";

const plan = (meal_type: string, status = "planned") => ({ id: meal_type, meal_type, status });

test("earliest planned meal type wins, whatever the row order", () => {
  const next = pickNextPlannedMeal([plan("dinner"), plan("snack"), plan("lunch")], []);
  assert.equal(next?.meal_type, "lunch");
});

test("a meal type already logged today is skipped (no double-log)", () => {
  const next = pickNextPlannedMeal([plan("lunch"), plan("dinner")], ["lunch", null]);
  assert.equal(next?.meal_type, "dinner");
});

test("eaten and skipped plan rows are not next", () => {
  const next = pickNextPlannedMeal(
    [plan("breakfast", "eaten"), plan("lunch", "skipped"), plan("dinner")],
    [],
  );
  assert.equal(next?.meal_type, "dinner");
});

test("nothing left → null", () => {
  assert.equal(pickNextPlannedMeal([plan("lunch", "eaten")], []), null);
  assert.equal(pickNextPlannedMeal([plan("dinner")], ["dinner"]), null);
  assert.equal(pickNextPlannedMeal([], []), null);
});

test("eat target: cook with a portion left", () => {
  assert.deepEqual(eatTargetFor({ cooks: { id: "c1", portions_remaining: 2 }, recipes: null }), {
    kind: "cook",
    cookId: "c1",
  });
});

test("eat target: an empty cook has nothing to log", () => {
  assert.equal(eatTargetFor({ cooks: { id: "c1", portions_remaining: 0 }, recipes: null }), null);
});

test("eat target: resolved recipe yes, name-only stub no", () => {
  assert.deepEqual(
    eatTargetFor({
      cooks: null,
      recipes: { id: "r1", macros_computed_at: "2026-10-01T00:00:00Z" },
    }),
    { kind: "recipe", recipeId: "r1" },
  );
  assert.equal(
    eatTargetFor({ cooks: null, recipes: { id: "r1", macros_computed_at: null } }),
    null,
  );
});

test("eat target: freeform plan has no one-tap log (status-only would be a plan with no meal_log)", () => {
  assert.equal(eatTargetFor({ cooks: null, recipes: null }), null);
});

test("macro totals: sums, rounds, and keeps untracked fiber/sugar null", () => {
  assert.deepEqual(
    sumMacroTotals([
      { calories: 500, protein_g: 40.4, carbs_g: 50.6, fat_g: 10.2, fiber_g: null, sugar_g: null },
      { calories: 300, protein_g: 20.3, carbs_g: null, fat_g: 9.9 },
    ]),
    { calories: 800, protein: 61, carbs: 51, fat: 20, fiber: null, sugar: null },
  );
  assert.deepEqual(
    sumMacroTotals([{ calories: 1, protein_g: 0, carbs_g: 0, fat_g: 0, fiber_g: 3.26 }]).fiber,
    3.3,
  );
  assert.deepEqual(sumMacroTotals([]), {
    calories: 0,
    protein: 0,
    carbs: 0,
    fat: 0,
    fiber: null,
    sugar: null,
  });
});

test("macro goals from profile; fiber defaults to 30", () => {
  assert.deepEqual(
    macroGoalsFromProfile({ calorie_goal: "2000", protein_goal: "160", carbs_goal: "x" }),
    { calories: 2000, protein: 160, carbs: null, fat: null, fiber: 30 },
  );
  assert.equal(macroGoalsFromProfile({ fiber_goal: "35" }).fiber, 35);
});
