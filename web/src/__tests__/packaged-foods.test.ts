import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  labelToPer100g,
  macrosForGrams,
  macrosForServings,
  containerWeightG,
} from "../lib/nutrition/packaged-foods.ts";
import type { PackagedFoodRow, LabelPanel } from "../lib/nutrition/packaged-foods.ts";

// The two real labels this table was built from, transcribed from photographs on 2026-09-03.
// They are used as fixtures deliberately: the arithmetic below is only worth anything if it
// reproduces panels that actually exist in the kitchen.
const BARILLA_TRICOLOR: LabelPanel = {
  servingSizeG: 56,
  calories: 200,
  proteinG: 7,
  carbsG: 42,
  fatG: 1,
  fiberG: 3,
  sugarG: 2,
  sodiumMg: 10,
};

const CLASSICO_SAUSAGE: LabelPanel = {
  servingSizeG: 125,
  calories: 60,
  proteinG: 2,
  carbsG: 9,
  fatG: 1.5,
  fiberG: 2,
  sugarG: 6,
  sodiumMg: 440,
};

const row = (panel: LabelPanel, extra: Partial<PackagedFoodRow> = {}): PackagedFoodRow => ({
  id: "00000000-0000-0000-0000-000000000000",
  brand: "Test",
  product: "Test",
  upc: null,
  serving_size_g: panel.servingSizeG,
  serving_label: null,
  servings_per_container: null,
  net_weight_g: null,
  prep_state: "as_sold",
  fdc_proxy_id: null,
  label_photographed_on: "2026-09-03",
  notes: null,
  ...labelToPer100g(panel),
  ...extra,
});

describe("labelToPer100g — the label's serving division happens exactly once", () => {
  it("converts the Barilla tri-color panel (56 g serving)", () => {
    const p = labelToPer100g(BARILLA_TRICOLOR);
    assert.equal(p.calories_per_100g, 357.14);
    assert.equal(p.protein_per_100g, 12.5);
    assert.equal(p.carbs_per_100g, 75);
    assert.equal(p.fat_per_100g, 1.79);
    assert.equal(p.fiber_per_100g, 5.36);
    assert.equal(p.sodium_mg_per_100g, 17.86);
  });

  it("converts the Classico panel (125 g serving) with no rounding loss at all", () => {
    // 125 g divides into 100 cleanly, so every value here is exact. Worth pinning separately
    // from the 56 g case so a regression in rounding cannot hide behind a ragged divisor.
    const p = labelToPer100g(CLASSICO_SAUSAGE);
    assert.equal(p.calories_per_100g, 48);
    assert.equal(p.protein_per_100g, 1.6);
    assert.equal(p.carbs_per_100g, 7.2);
    assert.equal(p.fat_per_100g, 1.2);
    assert.equal(p.fiber_per_100g, 1.6);
    assert.equal(p.sugar_per_100g, 4.8);
    assert.equal(p.sodium_mg_per_100g, 352);
  });

  it("keeps a missing optional nutrient null rather than turning it into zero", () => {
    // A panel that does not print fibre is UNKNOWN, not zero-fibre. Storing 0 would silently
    // pull a day's fibre total down and look like real data.
    const p = labelToPer100g({ servingSizeG: 50, calories: 100, proteinG: 5, carbsG: 10, fatG: 2 });
    assert.equal(p.fiber_per_100g, null);
    assert.equal(p.sugar_per_100g, null);
    assert.equal(p.sodium_mg_per_100g, null);
  });

  it("refuses a serving size that cannot be divided by", () => {
    for (const bad of [0, -56, Number.NaN]) {
      assert.throws(() => labelToPer100g({ ...BARILLA_TRICOLOR, servingSizeG: bad }), /> 0/);
    }
  });
});

describe("round trip — one serving of a stored row reproduces the printed panel", () => {
  // This is the invariant that matters. Storage is per-100 g, but the thing a person can
  // check against the box is the per-serving column, so the two must agree to the label's
  // own precision or the catalog is not auditable.
  it("reproduces the Barilla panel through a 56 g ragged divisor", () => {
    const m = macrosForServings(row(BARILLA_TRICOLOR), 1);
    assert.equal(m.calories, 200);
    assert.equal(m.protein_g, 7);
    assert.equal(m.carbs_g, 42);
    assert.equal(m.fat_g, 1);
    assert.equal(m.fiber_g, 3);
    assert.equal(m.sodium_mg, 10);
  });

  it("reproduces the Classico panel", () => {
    const m = macrosForServings(row(CLASSICO_SAUSAGE), 1);
    assert.equal(m.calories, 60);
    assert.equal(m.protein_g, 2);
    assert.equal(m.fat_g, 1.5);
    assert.equal(m.sodium_mg, 440);
  });
});

describe("macrosForGrams", () => {
  it("scales a whole 336 g box of pasta", () => {
    const m = macrosForGrams(row(BARILLA_TRICOLOR), 336);
    assert.equal(m.calories, 1199.99); // 6 x 200, modulo the stored 357.14
    assert.equal(m.protein_g, 42);
    assert.equal(m.fiber_g, 18.01);
  });

  it("treats an unknown nutrient as 0 when scaling, not as NaN", () => {
    // null means "the label did not say". It must not poison a sum — a NaN here would
    // propagate silently through a day total and render as a blank rather than an error.
    const m = macrosForGrams(
      row({ servingSizeG: 50, calories: 100, proteinG: 5, carbsG: 10, fatG: 2 }),
      100,
    );
    assert.equal(m.fiber_g, 0);
    assert.ok(Number.isFinite(m.sodium_mg));
  });

  it("refuses a negative weight", () => {
    assert.throws(() => macrosForGrams(row(BARILLA_TRICOLOR), -1), />= 0/);
  });
});

describe("containerWeightG — net weight beats reconstructing it from servings", () => {
  it("uses net_weight_g and says so", () => {
    const r = row(CLASSICO_SAUSAGE, { net_weight_g: 680, servings_per_container: 5 });
    assert.deepEqual(containerWeightG(r), { grams: 680, source: "net_weight" });
  });

  it("falls back to servings x serving_size, and that fallback is measurably light", () => {
    // The real Classico jar: "about 5 servings" of 125 g reconstructs to 625 g against a
    // true 680 g net weight — 8% short, most of a portion once a whole jar goes into a
    // four-portion batch. The source field exists so a caller can flag the number inferred.
    const r = row(CLASSICO_SAUSAGE, { servings_per_container: 5 });
    const got = containerWeightG(r);
    assert.deepEqual(got, { grams: 625, source: "servings" });
    assert.ok(Math.abs(625 - 680) / 680 > 0.07);
  });

  it("returns null when the container size is genuinely unknown", () => {
    assert.equal(containerWeightG(row(BARILLA_TRICOLOR)), null);
  });
});
