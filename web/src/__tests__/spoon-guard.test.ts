// Unit tests for the spoon-class authoring guard.
//
// WHY THIS EXISTS
//
// "Spoon-measured things lead with the volume" has been a standing rule since 2026-07-31 and has
// been broken twice — once by every recipe authored after the original sweep, and again by the four
// on the 2026-08-13 meal plan. Both times a human found it, not the system. A convention that lives
// only in prose gets re-broken by whoever writes the next recipe, so it is now a write-path error.

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  spoonViolations,
  parseIngredientRows,
  RecipeShapeError,
} from "../lib/nutrition/recipe-structured.ts";
import type { RecipeIngredient } from "../lib/types.ts";

const row = (item: string, quantity: number | null, unit: string | null): RecipeIngredient =>
  ({ item, quantity, unit }) as RecipeIngredient;

describe("spoonViolations", () => {
  it("flags the exact lines that regressed on the 2026-08-13 meal plan", () => {
    const v = spoonViolations([row("tomato paste", 13, "g"), row("avocado oil", 4, "g")]);
    assert.equal(v.length, 2);
    assert.equal(v[0].suggestion, "1 tbsp (16 g)");
    assert.equal(v[1].suggestion, "1 tsp (4.5 g)");
  });

  it("suggests the nearest real spoon, not an exact division", () => {
    // 8 g of oil is 1.78 tsp. Nobody measures 1.78 tsp.
    assert.equal(spoonViolations([row("avocado oil", 8, "g")])[0].suggestion, "2 tsp (9 g)");
    assert.equal(spoonViolations([row("avocado oil", 30, "g")])[0].suggestion, "2 tbsp (28 g)");
  });

  it("passes a line that already leads with a volume", () => {
    assert.deepEqual(spoonViolations([row("avocado oil (14 g)", 1, "tbsp")]), []);
  });

  it("exempts gochujang, which has no USDA record to resolve a volume against", () => {
    // Writing "1 tbsp" here would leave a re-resolve with no way back to grams.
    assert.deepEqual(spoonViolations([row("gochujang (1 tbsp)", 20, "g")]), []);
  });

  it("ignores things a scale handles well", () => {
    assert.deepEqual(
      spoonViolations([
        row("Ground beef 93/7 raw", 454, "g"),
        row("broccoli", 900, "g"),
        row("baby spinach", 150, "g"),
      ]),
      [],
    );
  });

  it("ignores amount-less rows and non-gram units", () => {
    assert.deepEqual(spoonViolations([row("salt, pepper", null, null)]), []);
    assert.deepEqual(spoonViolations([row("garlic", 2, "clove")]), []);
  });

  it("does not flag a zero or negative quantity as a spoon problem", () => {
    // Those are a different defect and belong to a different error message.
    assert.deepEqual(spoonViolations([row("avocado oil", 0, "g")]), []);
    assert.deepEqual(spoonViolations([row("avocado oil", -5, "g")]), []);
  });

  it("returns [] for null rows", () => {
    assert.deepEqual(spoonViolations(null), []);
  });
});

describe("parseIngredientRows rejects the write", () => {
  it("throws RecipeShapeError naming the item and the fix", () => {
    assert.throws(
      () => parseIngredientRows([{ item: "avocado oil", quantity: 4, unit: "g" }]),
      (e: unknown) => {
        assert.ok(e instanceof RecipeShapeError);
        assert.match((e as Error).message, /measured by spoon/);
        assert.match((e as Error).message, /"avocado oil" 4 g -> 1 tsp \(4\.5 g\)/);
        return true;
      },
    );
  });

  it("still accepts a correctly authored list", () => {
    const rows = parseIngredientRows([
      { item: "Ground beef 93/7 raw", quantity: 454, unit: "g", fdc_id: 173110 },
      { item: "avocado oil (9 g)", quantity: 2, unit: "tsp", fdc_id: 173573 },
      { item: "chili powder, cumin, salt", quantity: null, unit: null },
    ]);
    assert.equal(rows!.length, 3);
  });
});
