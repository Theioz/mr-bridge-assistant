// Unit tests for inventory macro resolution (nutrition/inventory-macros.ts).
// Run with: node --experimental-strip-types --test src/__tests__/inventory-macros.test.ts
//
// WHY THIS EXISTS
//
// The fridge view is the first screen that shows a macro number NEXT TO a food rather than
// inside a recipe, which makes a wrong one much more believable. Two failure modes matter:
//
//   1. A count unit silently treated as grams. "3 can" of black beans is not 3 g and not 3
//      cans' worth either — the conversion lives in the recipes (a 15.5 oz can is 270 g
//      drained) and this module must refuse rather than invent it.
//   2. A NULL quantity (an untracked staple) read as zero, which would render "0 kcal" for a
//      full jar of peanut butter.

import assert from "node:assert/strict";
import { test } from "node:test";
import { gramsOf, macrosForItem, macroGap } from "../lib/nutrition/inventory-macros.ts";

const CHICKEN = {
  calories: 120,
  protein_g: 22.5,
  carbs_g: 0,
  fat_g: 2.62,
  fiber_g: 0,
  sugar_g: 0,
  sodium_mg: 45,
};

test("grams scale straight through", () => {
  const m = macrosForItem(CHICKEN, 776, "g");
  assert.equal(m?.calories, 931);
  assert.equal(m?.protein_g, 174.6);
});

test("oz and lb convert before scaling", () => {
  assert.equal(Math.round(gramsOf(1, "lb") ?? 0), 454);
  assert.equal(Math.round(gramsOf(16, "oz") ?? 0), 454);
  assert.equal(gramsOf(1.5, "kg"), 1500);
});

test("a COUNT unit yields no macros and says why", () => {
  // 3 cans of black beans. The pin resolves; the grams do not exist.
  assert.equal(macrosForItem(CHICKEN, 3, "can"), null);
  assert.equal(macroGap(CHICKEN, 3, "can"), "Counted in can, not weighed");
  for (const u of ["can", "jar", "box", "each", "bottle", "bunch"]) {
    assert.equal(gramsOf(1, u), null, `${u} must not be treated as a mass`);
  }
});

test("a NULL quantity staple is unknown, never zero", () => {
  assert.equal(macrosForItem(CHICKEN, null, "g"), null);
  assert.equal(macroGap(CHICKEN, null, "g"), "Untracked staple — no amount recorded");
});

test("no pinned source is reported as such, not as zero macros", () => {
  assert.equal(macrosForItem(null, 500, "g"), null);
  assert.equal(macroGap(null, 500, "g"), "No macro source pinned");
});

test("a resolvable row reports no gap", () => {
  assert.equal(macroGap(CHICKEN, 776, "g"), null);
});

test("null fibre/sugar/sodium stay null rather than becoming 0", () => {
  const m = macrosForItem({ ...CHICKEN, fiber_g: null, sodium_mg: null }, 100, "g");
  assert.equal(m?.fiber_g, null);
  assert.equal(m?.sodium_mg, null);
  assert.equal(m?.calories, 120);
});
