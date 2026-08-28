import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { normalizeQuery } from "../lib/nutrition/pick-cache.ts";

describe("normalizeQuery", () => {
  it("folds the variations that would otherwise become separate rows", () => {
    const canonical = "chicken breast, roasted";
    for (const variant of [
      "Chicken Breast, Roasted",
      "  chicken breast, roasted  ",
      "chicken  breast,   roasted",
      "Chicken breast, roasted.",
      "chicken breast, roasted,",
    ]) {
      assert.equal(normalizeQuery(variant), canonical, variant);
    }
  });

  it("keeps distinct foods distinct — prep state is part of the identity", () => {
    // The whole point of the memo is pinning one record per food. Folding these together
    // would pin cooked rice's macros onto dry rice, a ~3x carb error.
    assert.notEqual(normalizeQuery("rice, brown, raw"), normalizeQuery("rice, brown, cooked"));
    assert.notEqual(normalizeQuery("chicken, raw"), normalizeQuery("chicken, roasted"));
  });

  it("returns empty for input with nothing in it", () => {
    assert.equal(normalizeQuery("   "), "");
    assert.equal(normalizeQuery(",,,"), "");
  });
});
