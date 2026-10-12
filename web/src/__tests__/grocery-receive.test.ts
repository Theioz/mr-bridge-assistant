// Unit tests for receiving a delivered order into inventory (#4, Phase 3).
// Run with: node --experimental-strip-types --test src/__tests__/grocery-receive.test.ts
//
// WHY: the receipt is what makes the next "Cooked it" draw real food. A wrong unit or a missing
// identity makes the draw silently skip; a second receipt of the same order doubles the fridge,
// which is the phantom-stock failure the planner then plans meals around.

import assert from "node:assert/strict";
import { test } from "node:test";
import {
  planReceipt,
  type PinForReceipt,
  type StockForReceipt,
} from "../lib/nutrition/grocery-receive.ts";

const salmon: PinForReceipt = {
  asin: "B0732ZP2HC",
  title: "MOWI Atlantic Salmon 12 oz",
  pack_grams: 340.19,
  fdc_id: 175167,
  packaged_food_id: null,
};
const pepper: PinForReceipt = {
  asin: "B000P6J14K",
  title: "Organic Green Bell Pepper (each)",
  pack_grams: null,
  fdc_id: 170427,
  packaged_food_id: null,
};

test("stores grams = pack grams × packs, with the pin's USDA identity", () => {
  const { rows } = planReceipt([{ asin: salmon.asin, packs: 2 }], [salmon], [], "113-1");
  assert.equal(rows.length, 1);
  assert.equal(rows[0].quantity, 680.4);
  assert.equal(rows[0].unit, "g");
  assert.equal(rows[0].fdc_id, 175167);
  assert.equal(rows[0].metadata.order_id, "113-1");
});

test("a per-item product is stored as a count, not an invented weight", () => {
  const { rows } = planReceipt([{ asin: pepper.asin, packs: 3 }], [pepper], [], null);
  assert.equal(rows[0].quantity, 3);
  assert.equal(rows[0].unit, "each");
});

test("an unpinned product is reported, never guessed", () => {
  const plan = planReceipt([{ asin: "B0NOTPINNED", packs: 1 }], [salmon], [], null);
  assert.equal(plan.rows.length, 0);
  assert.deepEqual(plan.skipped, [{ asin: "B0NOTPINNED", reason: "not-pinned" }]);
});

test("receiving the same order twice adds nothing the second time", () => {
  const stock: StockForReceipt[] = [
    {
      fdc_id: 175167,
      packaged_food_id: null,
      location: "fridge",
      metadata: { order_id: "113-1", asin: salmon.asin },
    },
  ];
  const plan = planReceipt([{ asin: salmon.asin, packs: 2 }], [salmon], stock, "113-1");
  assert.equal(plan.rows.length, 0);
  assert.equal(plan.skipped[0].reason, "already-received");
});

test("location: explicit, else where this food was last kept, else fridge", () => {
  const stock: StockForReceipt[] = [
    { fdc_id: 175167, packaged_food_id: null, location: "freezer", metadata: null },
  ];
  assert.equal(
    planReceipt([{ asin: salmon.asin, packs: 1 }], [salmon], stock, null).rows[0].location,
    "freezer",
  );
  assert.equal(
    planReceipt([{ asin: salmon.asin, packs: 1, location: "fridge" }], [salmon], stock, null)
      .rows[0].location,
    "fridge",
  );
  assert.equal(
    planReceipt([{ asin: pepper.asin, packs: 1 }], [pepper], stock, null).rows[0].location,
    "fridge",
  );
});

test("fractional or zero packs are rejected", () => {
  const plan = planReceipt(
    [
      { asin: salmon.asin, packs: 0 },
      { asin: salmon.asin, packs: 1.5 },
    ],
    [salmon],
    [],
    null,
  );
  assert.equal(plan.rows.length, 0);
  assert.equal(plan.skipped.length, 2);
});
