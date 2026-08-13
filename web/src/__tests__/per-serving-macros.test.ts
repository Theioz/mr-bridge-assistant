import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { storedMacrosFor, perPortion } from "../lib/nutrition/recipe-portions.ts";
import type { RecipeMacroTotals } from "../lib/nutrition/recipe-portions.ts";

const totals = (o: Partial<RecipeMacroTotals> = {}): RecipeMacroTotals => ({
  calories: 0,
  protein_g: 0,
  carbs_g: 0,
  fat_g: 0,
  fiber_g: 0,
  confidence: "high",
  notes: "",
  ...o,
});

describe("storedMacrosFor — the ingredient list is the batch, the stored figure is one serving", () => {
  it("passes a single-serving recipe through as the SAME object", () => {
    // Identity, not just equality. Every non-batch recipe in the library must be byte-identical
    // to its pre-change behaviour; a subtle re-round of 60 recipes would be invisible in review
    // and would show up only as drift in Jason's logged history.
    const t = totals({ calories: 902, protein_g: 59.7 });
    const { portions, stored } = storedMacrosFor(t, 1);
    assert.equal(portions, 1);
    assert.equal(stored, t);
  });

  it("treats null and undefined portions as one serving", () => {
    const t = totals({ calories: 500 });
    assert.equal(storedMacrosFor(t, null).stored, t);
    assert.equal(storedMacrosFor(t, undefined).stored, t);
  });

  it("divides the gochujang beef batch by 3 — a real 3x overlog before this change", () => {
    // typical_portions 3, stored 1783 kcal / 148.9 P, whole-batch ingredient list, and a valid
    // macros_computed_at. "Ate this" wrote the entire cook into meal_log for one sitting.
    const { portions, stored } = storedMacrosFor(
      totals({ calories: 1783, protein_g: 148.9, carbs_g: 150, fat_g: 60, fiber_g: 21 }),
      3,
    );
    assert.equal(portions, 3);
    assert.equal(stored.calories, 594);
    assert.equal(stored.protein_g, 49.6);
  });

  it("divides the tofu rice bowl by 2 — the recipe whose own note said '2 servings, not 1'", () => {
    const { stored } = storedMacrosFor(totals({ calories: 829, protein_g: 67.2 }), 2);
    assert.equal(stored.calories, 415);
    assert.equal(stored.protein_g, 33.6);
  });

  it("does not divide by a fractional or negative count", () => {
    // Dividing by 0.5 would DOUBLE a plate. A bad value must degrade to 'one serving', never to
    // a multiplier — the failure has to be inert, because the output is a health log.
    const t = totals({ calories: 800 });
    assert.equal(storedMacrosFor(t, 0.5).stored.calories, 800);
    assert.equal(storedMacrosFor(t, -2).stored.calories, 800);
    assert.equal(storedMacrosFor(t, 0).stored.calories, 800);
    assert.equal(storedMacrosFor(t, Number.NaN).stored.calories, 800);
    assert.equal(storedMacrosFor(t, Number.POSITIVE_INFINITY).stored.calories, 800);
  });

  it("floors a fractional batch count rather than dividing by it", () => {
    // 2.5 servings is not a thing you can plate. Flooring is the conservative read: it stores a
    // slightly larger serving rather than a smaller one, so the log never understates.
    const { portions, stored } = storedMacrosFor(totals({ calories: 900 }), 2.5);
    assert.equal(portions, 2);
    assert.equal(stored.calories, 450);
  });

  it("keeps confidence and notes off the divided result", () => {
    // They describe the resolve, not the food. A 'low' confidence batch is still low per serving,
    // and dividing a notes string is meaningless — so the persisted row takes them from `total`.
    const { stored } = storedMacrosFor(totals({ calories: 1000, confidence: "low" }), 2);
    assert.equal("confidence" in stored, false);
    assert.equal("notes" in stored, false);
  });

  it("agrees with perPortion, which the API still returns to callers", () => {
    const t = totals({ calories: 1783, protein_g: 148.9, carbs_g: 150, fat_g: 60, fiber_g: 21 });
    assert.deepEqual(storedMacrosFor(t, 3).stored, perPortion(t, 3));
  });
});
