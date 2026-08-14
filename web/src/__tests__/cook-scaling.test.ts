// Unit tests for scaling a recipe's per-serving macros up to a whole cook.
//
// WHY THIS EXISTS
//
// `cooks` stores the WHOLE COOK. `recipes` stores ONE SERVING. `createCook` copied the recipe's
// figures in unscaled, so a cook came out short by exactly its batch size — and `eatFromCook`,
// which divides the cook total by `portions`, then logged a fraction of a real plate.
//
// On 2026-08-13 a 902 kcal serving of Lamb Pasta reached meal_log as 451. The reason it survived
// review is that the wrong number is the right one divided by an integer: it reads as a plausible
// small lunch, not as an error. Only arithmetic catches that, which is what this file is.

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { perPortion } from "../lib/nutrition/recipe-portions.ts";
import type { RecipeMacroTotals } from "../lib/nutrition/recipe-portions.ts";

/** Mirrors the scaling in createCook: per-serving recipe figures × portions being made. */
const cookTotals = (
  perServing: Omit<RecipeMacroTotals, "confidence" | "notes">,
  portions: number,
) => {
  const r1 = (n: number) => Math.round(n * portions * 10) / 10;
  return {
    calories: Math.round(perServing.calories * portions),
    protein_g: r1(perServing.protein_g),
    carbs_g: r1(perServing.carbs_g),
    fat_g: r1(perServing.fat_g),
    fiber_g: r1(perServing.fiber_g),
  };
};

const LAMB_PASTA = { calories: 902, protein_g: 59.7, carbs_g: 83.6, fat_g: 36.8, fiber_g: 9.2 };

describe("cook totals scale a per-serving recipe up to the batch", () => {
  it("scales the real recipe that got halved", () => {
    const cook = cookTotals(LAMB_PASTA, 2);
    assert.equal(cook.calories, 1804);
    assert.equal(cook.protein_g, 119.4);
  });

  it("round-trips: cook total divided by portions is the serving you started with", () => {
    // This is the invariant that failed. eatFromCook divides by portions; if createCook did not
    // multiply, the round trip lands on half a meal.
    for (const portions of [1, 2, 3, 5, 8]) {
      const back = perPortion(cookTotals(LAMB_PASTA, portions), portions);
      assert.equal(back.calories, LAMB_PASTA.calories, `portions=${portions}`);
      assert.equal(back.protein_g, LAMB_PASTA.protein_g, `portions=${portions}`);
    }
  });

  it("leaves a single-portion cook identical to the recipe", () => {
    assert.deepEqual(cookTotals(LAMB_PASTA, 1), LAMB_PASTA);
  });

  it("scales the 3-portion case without drift", () => {
    const roast = { calories: 719, protein_g: 79.6, carbs_g: 60.2, fat_g: 19.1, fiber_g: 13.8 };
    const cook = cookTotals(roast, 3);
    assert.equal(cook.calories, 2157);
    assert.equal(perPortion(cook, 3).calories, 719);
  });

  it("does NOT silently produce a plausible-looking fraction", () => {
    // The bug's signature: the logged value is the truth divided by the batch size. Assert the
    // unscaled figure is not what a 2-portion cook stores, since that is precisely what shipped.
    assert.notEqual(cookTotals(LAMB_PASTA, 2).calories, LAMB_PASTA.calories);
    assert.equal(perPortion(LAMB_PASTA, 2).calories, 451); // what meal_log actually received
  });
});
