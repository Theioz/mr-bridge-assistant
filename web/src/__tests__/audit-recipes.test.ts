// Unit tests for the recipe invariant audit.
//
// WHY THIS EXISTS
//
// Both of this project's data conventions have decayed silently for weeks at a time, and both were
// found by a human reading a page rather than by anything in the system. The write-path guard and
// the database trigger stop NEW violations; this reporter is what surfaces the ones already stored,
// including rows written before either guard existed. Its own thresholds are worth pinning, because
// a reporter that stops reporting is indistinguishable from a clean library.

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { audit, SINGLE_PLATE_CEILING } from "../../scripts/audit-recipes.ts";
import type { Row } from "../../scripts/audit-recipes.ts";

const recipe = (o: Partial<Row> = {}): Row => ({
  id: "r1",
  name: "Test Recipe",
  ingredients_json: null,
  steps_json: null,
  instructions: null,
  typical_portions: 1,
  calories: 500,
  macros_computed_at: "2026-08-13T00:00:00Z",
  metadata: null,
  ...o,
});

const kinds = (rows: Row[]) => audit(rows).map((f) => f.kind);

describe("audit-recipes", () => {
  it("passes a fully compliant recipe", () => {
    assert.deepEqual(
      audit([
        recipe({
          ingredients_json: [
            { item: "chicken breast", quantity: 300, unit: "g", fdc_id: 171077 },
            { item: "avocado oil (14 g)", quantity: 1, unit: "tbsp", fdc_id: 173573 },
            { item: "salt, pepper", quantity: null, unit: null },
          ],
          steps_json: [{ step: 1, text: "Cook it." }],
        }),
      ]),
      [],
    );
  });

  it("catches the batch that logs the whole cook as one meal", () => {
    // The real one: Lemon Garlic Chicken + Pasta, 4646 kcal with typical_portions null.
    const f = audit([recipe({ calories: 4646, typical_portions: null })]);
    assert.deepEqual(
      f.map((x) => x.kind),
      ["undeclared-batch"],
    );
    assert.match(f[0].detail, /4646 kcal stored as one serving/);
  });

  it("does not flag a large single plate as a batch", () => {
    // The ribeye is genuinely ~1010 kcal for one sitting. A ceiling that catches it would train
    // Jason to ignore the report, which is how the spoon rule decayed in the first place.
    assert.deepEqual(kinds([recipe({ calories: 1010, typical_portions: 1 })]), []);
    assert.ok(SINGLE_PLATE_CEILING > 1010 && SINGLE_PLATE_CEILING < 1562);
  });

  it("does not flag a batch that correctly declared its portions", () => {
    assert.deepEqual(kinds([recipe({ calories: 594, typical_portions: 3 })]), []);
  });

  it("catches macros with no computed-at stamp", () => {
    // The gate: without it the recipe renders as a stub and "Ate this" writes no meal_log row.
    assert.deepEqual(kinds([recipe({ calories: 354, macros_computed_at: null })]), [
      "unstamped-macros",
    ]);
  });

  it("catches unpinned quantified ingredients but ignores amount-less ones", () => {
    const f = audit([
      recipe({
        ingredients_json: [
          { item: "chicken breast", quantity: 300, unit: "g" },
          { item: "salt, pepper", quantity: null, unit: null },
        ],
      }),
    ]);
    assert.deepEqual(
      f.map((x) => x.kind),
      ["unpinned-fdc-id"],
    );
    assert.match(f[0].detail, /1\/1 ingredients unpinned/);
  });

  it("catches a spoon-class ingredient still in grams", () => {
    assert.ok(
      kinds([
        recipe({ ingredients_json: [{ item: "avocado oil", quantity: 4, unit: "g", fdc_id: 1 }] }),
      ]).includes("spoon-unit"),
    );
  });

  it("catches a method that is still one undivided blob", () => {
    assert.ok(
      kinds([recipe({ steps_json: [{ step: 1, text: "x".repeat(250) }] })]).includes(
        "single-step-blob",
      ),
    );
  });

  it("does not flag a short single-step recipe", () => {
    // "Scramble, fry, or boil." is a legitimate one-step method.
    assert.deepEqual(
      kinds([recipe({ steps_json: [{ step: 1, text: "Scramble, fry, or boil." }] })]),
      [],
    );
  });

  it("catches instructions that never became structured steps", () => {
    assert.deepEqual(kinds([recipe({ instructions: "Cook it.", steps_json: null })]), [
      "no-structured-steps",
    ]);
  });
});
