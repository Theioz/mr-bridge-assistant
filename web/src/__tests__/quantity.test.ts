// Unit tests for the quantity lexer (nutrition/quantity.ts).
// Run with: node --experimental-strip-types --test src/__tests__/quantity.test.ts
// (from the web/ directory)
//
// WHY THIS EXISTS
//
// The pipeline's guarantee was "the model never produces a macro number — USDA does". That
// was never enough: the model still produced the two inputs that DETERMINE the macros, and
// it altered them. Measured on qwen2.5vl:7b against a real recipe:
//
//   "3 lb chicken breast, 2 cups dry brown rice, Green beans, olive oil"
//     -> "rice, brown, COOKED"      (the text said DRY — cooked grains are mostly water,
//                                    so this resolved ~90g of carbs instead of ~280g)
//     -> "green bean, 1 SERVING"    (no quantity was stated; it invented one)
//     -> olive oil                  (dropped entirely)
//
// The result was 3x wrong and was reported as HIGH confidence.
//
// "3 lb" and "2 cups" are literally written down. Reading them is a lexer's job. These tests
// pin that the number reaching USDA is the number the user wrote — and, just as importantly,
// that an ingredient with NO stated amount is reported as unquantified rather than guessed.

import { test } from "node:test";
import assert from "node:assert/strict";
import { lexQuantity, splitIngredients } from "../lib/nutrition/quantity.ts";
import { isPlausibleMatch } from "../lib/nutrition/fdc.ts";

test("reads a stated mass or volume exactly", () => {
  assert.deepEqual(lexQuantity("3 lb chicken breast"), {
    qty: 3,
    unit: "lb",
    source: "3 lb",
  });
  assert.deepEqual(lexQuantity("370 g dry brown rice"), { qty: 370, unit: "g", source: "370 g" });
  assert.equal(lexQuantity("2 cups dry brown rice")?.qty, 2);
  assert.equal(lexQuantity("2 cups dry brown rice")?.unit, "cup");
  assert.equal(lexQuantity("1.5 lb ground turkey")?.qty, 1.5);
});

test("handles the fractions people actually write", () => {
  assert.equal(lexQuantity("1/2 cup oats")?.qty, 0.5);
  assert.equal(lexQuantity("1 1/2 cups pasta")?.qty, 1.5);
  assert.equal(lexQuantity("½ cup rice")?.qty, 0.5);
  assert.equal(lexQuantity("1½ cups flour")?.qty, 1.5);
});

test("a bare count keeps the count and admits it doesn't know the weight", () => {
  // "each" is the honest unit: we know HOW MANY, and we are not pretending to know how much
  // one weighs. USDA's portion table answers that ("1 large egg = 50g").
  assert.deepEqual(lexQuantity("2 eggs"), { qty: 2, unit: "each", source: "2" });
  assert.equal(lexQuantity("12 drumsticks")?.qty, 12);
  assert.equal(lexQuantity("12 drumsticks")?.unit, "drumstick");
});

test("REFUSES to invent a quantity that was never stated", () => {
  // This is the important one. Returning null here is what makes the estimate flag the
  // ingredient and cap its confidence, instead of quietly folding a made-up serving into a
  // confident-looking total.
  assert.equal(lexQuantity("Green beans"), null);
  assert.equal(lexQuantity("olive oil"), null);
  assert.equal(lexQuantity("marinara"), null);
  assert.equal(lexQuantity("Onion, bell pepper"), null);
  // Not a measurement we can resolve — do not coerce it into one.
  assert.equal(lexQuantity("a handful of spinach"), null);
  assert.equal(lexQuantity(""), null);
});

test("splits a real recipe's ingredient text into ingredients", () => {
  assert.deepEqual(
    splitIngredients("3 lb chicken breast, 2 cups dry brown rice\nGreen beans, olive oil + lemon"),
    ["3 lb chicken breast", "2 cups dry brown rice", "Green beans", "olive oil", "lemon"],
  );
});

// ---------------------------------------------------------------------------
// Food-selection guard.
//
// The model picks from a USDA candidate list. When USDA's search returns nothing relevant it
// picks the least-bad of a bad set, silently. Observed on real recipes:
//
//   "salt"       -> "Syrups, table blends, pancake"   (20g of SYRUP in a zero-calorie
//                                                      ingredient — it INVENTS calories)
//   "broccolini" -> "Abiyuch, raw"                    (a tropical fruit)
//   "marinara"   -> "Cheese sauce, prepared from recipe"
//
// No prompt fixes this — the right answer was never in the list. The guard is arithmetic.
// ---------------------------------------------------------------------------

test("rejects a candidate that is not plausibly the food asked for", () => {
  assert.equal(isPlausibleMatch("salt", "Syrups, table blends, pancake"), false);
  assert.equal(isPlausibleMatch("broccolini", "Abiyuch, raw"), false);
  assert.equal(isPlausibleMatch("marinara", "Cheese sauce, prepared from recipe"), false);
});

test("accepts the real match, including USDA's verbose phrasing", () => {
  assert.equal(
    isPlausibleMatch("chicken, breast, raw", "Chicken, broilers or fryers, meat only, raw"),
    true,
  );
  assert.equal(
    isPlausibleMatch("rice, brown, long-grain, raw", "Rice, brown, long grain, unenriched, raw"),
    true,
  );
  assert.equal(isPlausibleMatch("green beans, raw", "Beans, snap, green, raw"), true);
  assert.equal(isPlausibleMatch("turkey, ground, raw", "Turkey, Ground, raw"), true);
  assert.equal(isPlausibleMatch("pasta, dry, enriched", "Pasta, dry, enriched"), true);
});

test("a shared PREPARATION word is not a match", () => {
  // Otherwise "rice, brown, raw" would happily match "Beef, raw" on the strength of "raw"
  // alone — which is how you end up with beef where the rice should be.
  assert.equal(isPlausibleMatch("rice, brown, raw", "Beef, ribeye, raw"), false);
  assert.equal(isPlausibleMatch("oats, dry", "Sugars, granulated, dry"), false);
});
