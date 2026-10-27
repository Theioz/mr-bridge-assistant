// Unit tests for scaleIngredients (lib/units.ts).
// Run with: node --experimental-strip-types --test src/__tests__/scale-ingredients.test.ts
// (from the web/ directory)
//
// WHY THIS EXISTS
//
// The recipe view's "Makes N portions" box rescales a recipe's ingredient amounts for display.
// The rounding is the part that can go wrong quietly: a scale reads in whole grams, a spoon in
// quarters, and "salt, to taste" has no amount to scale at all.

import { test } from "node:test";
import assert from "node:assert/strict";
import { scaleIngredients } from "../lib/units.ts";
import type { RecipeIngredient } from "../lib/types.ts";

const GOCHUJANG_CHICKEN: RecipeIngredient[] = [
  { item: "boneless skinless chicken thighs, RAW weight", quantity: 567, unit: "g" },
  { item: "gochujang", quantity: 35, unit: "g", note: "35 g matches the real usage rate" },
  { item: "soy sauce", quantity: 1, unit: "tbsp" },
  { item: "Scallions to garnish", quantity: null, unit: null },
];

test("doubling a batch of 3 to 6 doubles every amount", () => {
  const out = scaleIngredients(GOCHUJANG_CHICKEN, 3, 6);
  assert.deepEqual(
    out.map((i) => i.quantity),
    [1134, 70, 2, null],
  );
});

test("weighed units round to whole grams", () => {
  const out = scaleIngredients(GOCHUJANG_CHICKEN, 3, 4);
  assert.equal(out[0].quantity, 756);
  assert.equal(out[1].quantity, 47); // 46.67
});

test("counted units round to the nearest quarter, never below a quarter", () => {
  assert.equal(scaleIngredients(GOCHUJANG_CHICKEN, 3, 4)[2].quantity, 1.25); // 1.33
  assert.equal(scaleIngredients(GOCHUJANG_CHICKEN, 6, 1)[2].quantity, 0.25); // 0.17
});

test("a scaled row drops its note; an unscaled list is returned as is", () => {
  assert.equal(scaleIngredients(GOCHUJANG_CHICKEN, 3, 6)[1].note, null);
  assert.equal(scaleIngredients(GOCHUJANG_CHICKEN, 3, 3), GOCHUJANG_CHICKEN);
});

test("a bad portion count leaves the list untouched rather than zeroing it", () => {
  assert.equal(scaleIngredients(GOCHUJANG_CHICKEN, 3, 0), GOCHUJANG_CHICKEN);
  assert.equal(scaleIngredients(GOCHUJANG_CHICKEN, 0, 6), GOCHUJANG_CHICKEN);
  assert.equal(scaleIngredients(GOCHUJANG_CHICKEN, 3, Number.NaN), GOCHUJANG_CHICKEN);
});
