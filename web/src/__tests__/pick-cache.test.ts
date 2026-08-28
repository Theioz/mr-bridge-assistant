import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { validateBatchPicks, type PickGroup } from "../lib/nutrition/parse.ts";
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

describe("validateBatchPicks", () => {
  const groups: PickGroup[] = [
    { wanted: "chicken breast, roasted", candidates: [{ description: "a" }, { description: "b" }] },
    { wanted: "rice, white, cooked", candidates: [{ description: "c" }, { description: "d" }] },
    { wanted: "green beans, cooked", candidates: [{ description: "e" }] },
  ];

  it("maps each food to its own chosen index", () => {
    const out = validateBatchPicks(
      [
        { food: 0, index: 1, confident: true },
        { food: 1, index: 0, confident: true },
        { food: 2, index: 0, confident: true },
      ],
      groups,
    );
    assert.deepEqual(out, [1, 0, 0]);
  });

  it("answers in any order, and a missing food is null rather than a shifted answer", () => {
    // The dangerous failure is positional: if entries were trusted by position, a model that
    // skipped food 1 would log rice's choice against green beans.
    const out = validateBatchPicks(
      [
        { food: 2, index: 0, confident: true },
        { food: 0, index: 0, confident: true },
      ],
      groups,
    );
    assert.deepEqual(out, [0, null, 0]);
  });

  it("drops an index outside that food's own candidate list", () => {
    const out = validateBatchPicks(
      [
        { food: 0, index: 7, confident: true },
        { food: 2, index: 1, confident: true }, // only one candidate, so 1 is out of range
      ],
      groups,
    );
    assert.deepEqual(out, [null, null, null]);
  });

  it("drops an unknown food number instead of writing past the end", () => {
    const out = validateBatchPicks(
      [
        { food: 9, index: 0, confident: true },
        { food: -1, index: 0, confident: true },
      ],
      groups,
    );
    assert.deepEqual(out, [null, null, null]);
  });

  it("honours confident=false — that is a real answer, not a failure", () => {
    const out = validateBatchPicks([{ food: 0, index: 1, confident: false }], groups);
    assert.deepEqual(out, [null, null, null]);
  });

  it("keeps the first answer for a food, not the last", () => {
    const out = validateBatchPicks(
      [
        { food: 0, index: 0, confident: true },
        { food: 0, index: 1, confident: true },
      ],
      groups,
    );
    assert.equal(out[0], 0);
  });

  it("survives a missing or malformed payload", () => {
    assert.deepEqual(validateBatchPicks(undefined, groups), [null, null, null]);
    assert.deepEqual(validateBatchPicks([], groups), [null, null, null]);
    assert.deepEqual(
      validateBatchPicks(
        [
          { food: "0", index: "1", confident: true } as unknown as {
            food: number;
            index: number;
            confident: boolean;
          },
        ],
        groups,
      ),
      [1, null, null],
    );
  });

  it("returns an empty array for no groups", () => {
    assert.deepEqual(validateBatchPicks([{ food: 0, index: 0, confident: true }], []), []);
  });
});
