// Unit tests for the structured recipe columns (lib/units.ts, lib/nutrition/recipe-structured.ts).
// Run with: node --experimental-strip-types --test src/__tests__/structured-recipes.test.ts
// (from the web/ directory)
//
// WHY THIS EXISTS
//
// `ingredients_json` is not a presentation change — it is the INPUT TO THE MACRO PIPELINE, and it
// removes the local model from that path entirely. Two properties have to hold or the numbers get
// quietly worse rather than better:
//
//   1. A structured row must render exactly like the text line it replaces. The imperial and rice
//      `go` annotations from #665 live in the text path; if the structured path skipped them, half
//      the library would silently lose its unit hints mid-backfill.
//
//   2. `quantity: null` must survive validation as a distinct state. The resolver EXCLUDES those
//      rows from the total on purpose ("salt, to taste" has no mass). If validation coerced null to
//      0 — or rejected the row — a real ingredient would either vanish from a real plate or block a
//      save. Both were live failure modes in the prose path this replaces.

import { test } from "node:test";
import assert from "node:assert/strict";
import { formatIngredient, groupIngredients, splitIngredientLines } from "../lib/units.ts";
import {
  RecipeShapeError,
  parseIngredientRows,
  parseStepRows,
} from "../lib/nutrition/recipe-structured.ts";

// ── formatIngredient ────────────────────────────────────────────────────────────

test("structured row picks up the same imperial annotation as a text line", () => {
  const out = formatIngredient({ item: "ground beef, 93/7", quantity: 454, unit: "g" });
  assert.match(out, /^454 g/);
  assert.match(out, /16 oz/); // the annotation the text path would have added
  assert.match(out, /ground beef/);
});

test("small amounts skip the ounce annotation, as in the text path", () => {
  // Below 15 g an ounce figure is noise ("5 g of oil -> 0.2 oz").
  const out = formatIngredient({ item: "avocado oil", quantity: 5, unit: "g" });
  assert.equal(out, "5 g avocado oil");
});

test("rice carries its go conversion", () => {
  const out = formatIngredient({ item: "dry white rice", quantity: 300, unit: "g" });
  assert.match(out, /2 go/);
});

test("prep is folded into the line, not dropped", () => {
  const out = formatIngredient({
    item: "chicken breast",
    quantity: 302,
    unit: "g",
    prep: "raw",
  });
  assert.match(out, /chicken breast, raw/);
});

test("an amount-less ingredient renders without a leading number", () => {
  const out = formatIngredient({ item: "salt", quantity: null, unit: null });
  assert.equal(out, "salt");
});

test("note and optional are appended after annotation, so a note cannot suppress it", () => {
  // `annotateRice` bails on any line already containing a bare "go". A note is free text and could
  // contain one, so notes must be appended AFTER the annotators run.
  const out = formatIngredient({
    item: "dry white rice",
    quantity: 300,
    unit: "g",
    note: "let it go 12 min",
  });
  assert.match(out, /2 go/, "rice annotation survived a note containing the word 'go'");
  assert.match(out, /— let it go 12 min$/);
});

test("optional is marked", () => {
  const out = formatIngredient({ item: "parmesan", quantity: 5, unit: "g", optional: true });
  assert.match(out, /\(optional\)/);
});

// ── groupIngredients ────────────────────────────────────────────────────────────

test("ungrouped rows collapse to a single null bucket in original order", () => {
  const groups = groupIngredients([
    { item: "a", quantity: null, unit: null },
    { item: "b", quantity: null, unit: null },
  ]);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].group, null);
  assert.deepEqual(
    groups[0].items.map((i) => i.item),
    ["a", "b"],
  );
});

test("groups keep first-seen order and re-collect non-adjacent rows", () => {
  const groups = groupIngredients([
    { item: "beef", quantity: null, unit: null, group: "Chili" },
    { item: "basil", quantity: null, unit: null, group: "Sauce" },
    { item: "cumin", quantity: null, unit: null, group: "Chili" },
  ]);
  assert.deepEqual(
    groups.map((g) => g.group),
    ["Chili", "Sauce"],
  );
  assert.deepEqual(
    groups[0].items.map((i) => i.item),
    ["beef", "cumin"],
  );
});

// ── splitIngredientLines ────────────────────────────────────────────────────────

test("raw split does NOT annotate — the editor must see what was typed", () => {
  // parseIngredients would return "200 g (7.1 oz) beef"; feeding that back into the amount lexer
  // gives it two numbers to choose between.
  assert.deepEqual(splitIngredientLines("200 g beef"), ["200 g beef"]);
});

test("raw split still recovers a JSON array written into the text column", () => {
  assert.deepEqual(splitIngredientLines('["255 g chicken", "120 g edamame"]'), [
    "255 g chicken",
    "120 g edamame",
  ]);
});

// ── validation ──────────────────────────────────────────────────────────────────

test("quantity null is valid and is preserved, not coerced to 0", () => {
  const rows = parseIngredientRows([{ item: "salt", quantity: null }]);
  assert.equal(rows![0].quantity, null);
  assert.equal(rows![0].unit, null);
});

test("a quantity with no unit is rejected", () => {
  // A bare number cannot be converted to grams, so USDA would fall back to an assumed portion —
  // an amount that looks stated but is not.
  assert.throws(() => parseIngredientRows([{ item: "beef", quantity: 200 }]), RecipeShapeError);
});

test("a string quantity is rejected rather than coerced", () => {
  // "200g" as a string resolves to nothing downstream and silently drops the ingredient.
  assert.throws(
    () => parseIngredientRows([{ item: "beef", quantity: "200", unit: "g" }]),
    RecipeShapeError,
  );
});

test("an empty item is rejected", () => {
  assert.throws(() => parseIngredientRows([{ item: "   ", quantity: null }]), RecipeShapeError);
});

test("a non-integer fdc_id is rejected", () => {
  assert.throws(
    () => parseIngredientRows([{ item: "beef", quantity: 1, unit: "g", fdc_id: 1.5 }]),
    RecipeShapeError,
  );
});

test("a valid fdc_id survives", () => {
  const rows = parseIngredientRows([
    { item: "chicken breast", quantity: 302, unit: "g", fdc_id: 171477 },
  ]);
  assert.equal(rows![0].fdc_id, 171477);
});

test("null input means 'not provided', not 'empty list'", () => {
  // The PATCH route distinguishes these: absent leaves the column alone, [] clears it.
  assert.equal(parseIngredientRows(null), null);
  assert.deepEqual(parseIngredientRows([]), []);
});

test("steps default their number to array position", () => {
  const steps = parseStepRows([{ text: "Brown the beef" }, { text: "Add tomatoes" }]);
  assert.deepEqual(
    steps!.map((s) => s.step),
    [1, 2],
  );
});

test("an explicit step number wins over position", () => {
  const steps = parseStepRows([{ step: 4, text: "Simmer" }]);
  assert.equal(steps![0].step, 4);
});

test("blank tips are dropped rather than stored as empty strings", () => {
  const steps = parseStepRows([{ text: "Simmer", tips: ["  ", "Stir occasionally"] }]);
  assert.deepEqual(steps![0].tips, ["Stir occasionally"]);
});

test("a non-array payload is rejected", () => {
  assert.throws(() => parseIngredientRows({ item: "beef" }), RecipeShapeError);
});
