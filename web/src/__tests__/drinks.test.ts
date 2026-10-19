// Drink arithmetic (lib/nutrition/drinks.ts), shared by the log_drink tool and the scorecard.
// Run with: node --experimental-strip-types --test src/__tests__/drinks.test.ts
// (from the web/ directory)

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { ethanolKcal, standardDrinks } from "../lib/nutrition/drinks.ts";

describe("standardDrinks", () => {
  it("a 750 ml bottle of 13.5% wine is 5.71 standard drinks", () => {
    assert.equal(standardDrinks(750, 13.5), 5.71);
  });

  it("a 12 oz (355 ml) 5% beer is about one standard drink", () => {
    const d = standardDrinks(355, 5);
    assert.ok(Math.abs(d - 1) < 0.05, `got ${d}`);
  });

  it("zero volume is zero drinks", () => {
    assert.equal(standardDrinks(0, 40), 0);
    assert.equal(ethanolKcal(0, 40), 0);
  });

  it("rejects a negative volume or an impossible ABV", () => {
    assert.throws(() => standardDrinks(-1, 5), /volume_ml/);
    assert.throws(() => standardDrinks(355, 101), /abv_pct/);
    assert.throws(() => standardDrinks(355, -1), /abv_pct/);
    assert.throws(() => ethanolKcal(Number.NaN, 5), /volume_ml/);
  });
});

describe("ethanolKcal", () => {
  it("is 7 kcal per gram of ethanol, rounded", () => {
    // 750 × 0.135 × 0.789 = 79.88 g → 559.2 kcal
    assert.equal(ethanolKcal(750, 13.5), 559);
    // 355 × 0.05 × 0.789 = 14.0 g → 98 kcal
    assert.equal(ethanolKcal(355, 5), 98);
  });
});
