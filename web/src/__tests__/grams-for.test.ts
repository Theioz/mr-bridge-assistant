// Unit tests for gram conversion (nutrition/fdc.ts -> gramsFor).
// Run with: node --experimental-strip-types --test src/__tests__/grams-for.test.ts
// (from the web/ directory)
//
// WHY THIS EXISTS
//
// Sibling to quantity.test.ts. That file pins that the NUMBER reaching USDA is the number
// the user wrote. This one pins that the number is then converted to the right WEIGHT.
//
// The bug that prompted it: `ml` was a recognised alias in quantity.ts, so the lexer
// correctly produced {qty: 750, unit: "ml"} for "750 ml red wine". But gramsFor had no
// entry for it in DIRECT_GRAMS, and "ml" is not in GENERIC_UNITS either, so it fell all
// the way through to the step-4 fallback:
//
//     FALLBACK_GRAMS[u] ?? FALLBACK_GRAMS.serving   // = 100 g
//     -> 750 * 100 = 75,000 g
//
// A 750 ml bottle of wine resolved to 62,250 kcal. Every ml/l quantity was silently 100x
// its real weight. The confidence guard caught it only as "low" — it still emitted the
// number, and a `low` badge is not the same as refusing to answer.
//
// A correctly-lexed quantity is not enough. It has to land in a unit table too, and the
// failure mode when it doesn't is a wrong number, not an error.

import { test } from "node:test";
import assert from "node:assert/strict";
import { gramsFor } from "../lib/nutrition/fdc.ts";

// USDA returns per-food portion rows; most beverages have none, which is what pushed
// "ml" down to the fallback branch in the first place.
const NO_PORTIONS: never[] = [];

test("ml converts at water density, not via the 100g serving fallback", () => {
  const r = gramsFor(750, "ml", NO_PORTIONS);
  assert.equal(r.grams, 750, "750 ml must be 750 g, not 75,000");
  assert.equal(r.exact, true, "a stated volume is the user's own measurement");
});

test("litres scale by 1000", () => {
  assert.equal(gramsFor(1, "l", NO_PORTIONS).grams, 1000);
  assert.equal(gramsFor(1.5, "liters", NO_PORTIONS).grams, 1500);
});

test("ml aliases all resolve", () => {
  for (const u of ["ml", "milliliter", "milliliters"]) {
    assert.equal(gramsFor(250, u, NO_PORTIONS).grams, 250, `${u} should be 1 g/ml`);
  }
});

test("a 750 ml bottle lands in a plausible calorie range for wine", () => {
  // Regression guard in the units that actually matter. USDA 174833 (Cabernet Sauvignon)
  // is ~83 kcal/100 g, so a bottle is ~620 kcal — not ~62,000.
  const { grams } = gramsFor(750, "ml", NO_PORTIONS);
  const kcal = (grams / 100) * 83;
  assert.ok(kcal > 500 && kcal < 750, `expected ~620 kcal for a bottle, got ${Math.round(kcal)}`);
});

test("existing weight units are unchanged", () => {
  assert.equal(gramsFor(5, "g", NO_PORTIONS).grams, 5);
  assert.equal(gramsFor(1, "kg", NO_PORTIONS).grams, 1000);
  assert.equal(Math.round(gramsFor(1, "lb", NO_PORTIONS).grams), 454);
  assert.equal(Math.round(gramsFor(1, "oz", NO_PORTIONS).grams), 28);
});

test("an unknown unit still falls back, and still says so", () => {
  // The fallback branch is correct behaviour for a genuinely unknown unit — what was
  // wrong was ml reaching it. `exact: false` is what downgrades the confidence badge.
  const r = gramsFor(2, "handful", NO_PORTIONS);
  assert.equal(r.exact, false);
});
