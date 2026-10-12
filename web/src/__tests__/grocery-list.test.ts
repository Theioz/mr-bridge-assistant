// Unit tests for the grocery list (#4, Phase 1).
// Run with: node --experimental-strip-types --test src/__tests__/grocery-list.test.ts
// (from the web/ directory)
//
// WHY THIS EXISTS
//
// The list turns a meal plan into money spent. The failure modes worth pinning are the
// expensive ones: buying the wrong FOOD (a name match — the 7/29 "House Napa Cabbage" kimchi
// read as fresh napa), buying at the wrong SCALE (ingredients_json is the whole batch, not one
// serving), and buying what the fridge already holds.

import assert from "node:assert/strict";
import { test } from "node:test";
import { computeGroceryList, type GroceryProduct } from "../lib/nutrition/grocery-list.ts";
import type { StockRow } from "../lib/nutrition/inventory-draw.ts";

const COD = 175174;
const TOFU = 172475;

const cod: GroceryProduct = {
  id: "p1",
  asin: "B07COD0001",
  title: "Amazon wild-caught Pacific cod, 16 oz",
  pack_grams: 453.59,
  price_cents: 1099,
  fresh: true,
  fdc_id: COD,
  packaged_food_id: null,
};

function stock(row: Partial<StockRow>): StockRow {
  return {
    id: "s",
    name: "x",
    quantity: null,
    unit: null,
    location: "fridge",
    expires_on: null,
    fdc_id: null,
    metadata: null,
    ...row,
  };
}

const codRecipe = (portions: number) => ({
  name: "Cod bowl",
  portions,
  typicalPortions: 4,
  lines: [{ item: "cod, raw", quantity: 800, unit: "g", fdc_id: COD }],
});

test("scales the batch by planned portions / typical portions", () => {
  // 2 of a 4-portion batch = half of 800 g = 400 g -> one 453.59 g pack.
  const list = computeGroceryList([codRecipe(2)], [], [cod]);
  const line = list.lines[0];
  assert.equal(line.gramsNeeded, 400);
  assert.equal(line.product?.packs, 1);
  assert.equal(list.estCents, 1099);
});

test("rounds up to whole packs and prices them", () => {
  // Full batch, 800 g -> 2 packs (907 g), never 1.76 packs.
  const list = computeGroceryList([codRecipe(4)], [], [cod]);
  assert.equal(list.lines[0].product?.packs, 2);
  assert.equal(list.lines[0].product?.estCents, 2198);
});

test("aggregates the same food across recipes into one line", () => {
  const other = { ...codRecipe(4), name: "Cod stew" };
  const list = computeGroceryList([codRecipe(2), other], [], [cod]);
  assert.equal(list.lines.length, 1);
  assert.equal(list.lines[0].gramsNeeded, 1200);
  assert.deepEqual(list.lines[0].recipes, ["Cod bowl", "Cod stew"]);
  assert.equal(list.lines[0].product?.packs, 3);
});

test("subtracts what the kitchen holds, by USDA id", () => {
  const fridge = [stock({ name: "Pacific cod fillets", fdc_id: COD, quantity: 500, unit: "g" })];
  const list = computeGroceryList([codRecipe(4)], fridge, [cod]);
  assert.equal(list.lines[0].gramsOnHand, 500);
  assert.equal(list.lines[0].gramsToBuy, 300);
  assert.equal(list.lines[0].product?.packs, 1);
});

test("enough in the kitchen means nothing to buy", () => {
  const fridge = [stock({ fdc_id: COD, quantity: 2, unit: "lb" })];
  const list = computeGroceryList([codRecipe(4)], fridge, [cod]);
  assert.equal(list.lines[0].status, "covered");
  assert.equal(list.toBuy, 0);
});

test("never matches a PRODUCT by name — an unpinned food needs a pin", () => {
  // The kimchi trap: a product titled like the ingredient, pinned to a different food.
  const kimchi: GroceryProduct = {
    ...cod,
    asin: "B0KIMCHI01",
    title: "Mother-in-Law's Kimchi, House Napa Cabbage",
    fdc_id: 999999,
  };
  const napa = {
    name: "Slaw",
    portions: 1,
    typicalPortions: 1,
    lines: [{ item: "napa cabbage", quantity: 300, unit: "g", fdc_id: 169228 }],
  };
  const list = computeGroceryList([napa], [], [kimchi]);
  assert.equal(list.lines[0].status, "buy");
  assert.equal(list.lines[0].product, null);
  assert.equal(list.lines[0].needsPin, true);
  assert.equal(list.needsPin, 1);
});

test("a staple in the kitchen is assumed on hand", () => {
  const r = {
    name: "Stir fry",
    portions: 1,
    typicalPortions: 1,
    lines: [{ item: "toasted sesame oil (9 g)", quantity: 2, unit: "tsp" }],
  };
  const list = computeGroceryList(
    [r],
    [stock({ name: "sesame oil, toasted", quantity: null })],
    [],
  );
  assert.equal(list.lines[0].status, "staple");
});

test("stock with no weighable unit says look, not buy", () => {
  const r = {
    name: "Tofu bowl",
    portions: 1,
    typicalPortions: 1,
    lines: [{ item: "firm tofu", quantity: 400, unit: "g", fdc_id: TOFU }],
  };
  const list = computeGroceryList([r], [stock({ fdc_id: TOFU, quantity: 1, unit: "block" })], []);
  assert.equal(list.lines[0].status, "check-stock");
});

test("unknown pack weight buys one and says so", () => {
  const cabbage: GroceryProduct = { ...cod, asin: "B0CABBAGE1", fdc_id: 169975, pack_grams: null };
  const r = {
    name: "Slaw",
    portions: 1,
    typicalPortions: 1,
    lines: [{ item: "green cabbage", quantity: 400, unit: "g", fdc_id: 169975 }],
  };
  const list = computeGroceryList([r], [], [cabbage]);
  assert.equal(list.lines[0].product?.packs, 1);
  assert.match(list.lines[0].detail, /unknown/);
});

test("optional lines are not bought", () => {
  const r = {
    name: "Bowl",
    portions: 1,
    typicalPortions: 1,
    lines: [{ item: "scallions", quantity: 20, unit: "g", optional: true }],
  };
  assert.equal(computeGroceryList([r], [], []).lines[0].status, "optional");
});

test("a pack a hair short of the need does not buy a second pack", () => {
  // 454 g of beef against a 453.59 g pound: one pack, not two.
  const beef: GroceryProduct = { ...cod, asin: "B0BEEF0001", fdc_id: 173110, pack_grams: 453.59 };
  const r = {
    name: "Chili",
    portions: 1,
    typicalPortions: 1,
    lines: [{ item: "ground beef 93/7", quantity: 454, unit: "g", fdc_id: 173110 }],
  };
  assert.equal(computeGroceryList([r], [], [beef]).lines[0].product?.packs, 1);
});

test("but a real shortfall still buys the next pack", () => {
  // 500 g against 453.59 g packs is 10% over: two packs.
  const beef: GroceryProduct = { ...cod, asin: "B0BEEF0001", fdc_id: 173110, pack_grams: 453.59 };
  const r = {
    name: "Chili",
    portions: 1,
    typicalPortions: 1,
    lines: [{ item: "ground beef 93/7", quantity: 500, unit: "g", fdc_id: 173110 }],
  };
  assert.equal(computeGroceryList([r], [], [beef]).lines[0].product?.packs, 2);
});

test("a recipe with no structured ingredients is reported, never silently dropped", () => {
  const legacy = { name: "Beef + Chickpea Rotini", portions: 3, typicalPortions: 4, lines: [] };
  const list = computeGroceryList([legacy, codRecipe(4)], [], [cod]);
  assert.deepEqual(list.unlisted, ["Beef + Chickpea Rotini"]);
  assert.equal(list.lines.length, 1);
});
