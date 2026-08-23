import assert from "node:assert/strict";
import test from "node:test";

import {
  gochujangLabelViolations,
  riceNamingViolations,
  RecipeShapeError,
  parseIngredientRows,
} from "../lib/nutrition/recipe-structured.ts";
import { parseIngredients } from "../lib/units.ts";

// The two rules under test are RENDER-coupled: they exist so `annotateRice` in units.ts can fire
// and so a human sees the spoon they actually measure with. Every "good" shape below is asserted
// against the real annotator rather than against a second copy of the regex, so the guard and the
// renderer cannot drift apart into separately-correct halves.

const g = (item: string, quantity: number | null, unit: string | null) => ({
  item,
  quantity,
  unit,
  prep: null,
  group: null,
  note: null,
  fdc_id: null,
});

test("rice named so annotateRice cannot match is rejected", () => {
  // This exact shape shipped in 5 recipes and rendered no go at all.
  const bad = riceNamingViolations([g("Brown rice, long-grain, DRY", 150, "g")]);
  assert.equal(bad.length, 1);
  assert.match(bad[0].detail, /annotateRice cannot match/);
});

test("rice named the documented way passes AND actually renders a go", () => {
  assert.deepEqual(riceNamingViolations([g("dry brown rice, long-grain", 150, "g")]), []);
  assert.match(parseIngredients("150 g dry brown rice, long-grain")[0], /1 go/);

  assert.deepEqual(riceNamingViolations([g("cooked brown rice", 220, "g")]), []);
  assert.match(parseIngredients("220 g cooked brown rice")[0], /0\.53 go/);
});

test("rice-adjacent ingredients are not rice", () => {
  assert.deepEqual(riceNamingViolations([g("rice vinegar", 15, "g")]), []);
  assert.deepEqual(riceNamingViolations([g("rice noodles, flat", 200, "g")]), []);
});

test("a line already carrying its own go is left alone", () => {
  assert.deepEqual(riceNamingViolations([g("brown rice (0.5 go), day-old", 80, "g")]), []);
});

test("gochujang with bare grams and no spoon is rejected, with the spoon suggested", () => {
  const bad = gochujangLabelViolations([g("Gochujang", 60, "g")]);
  assert.equal(bad.length, 1);
  assert.match(bad[0].detail, /gochujang \(3 tbsp\)/);
});

test("gochujang with the spoon as the QUANTITY is rejected — the inverse error", () => {
  // Four rows in the library looked like this. It is the one that breaks a re-resolve, because
  // there is no portion table to convert the volume back into grams.
  const bad = gochujangLabelViolations([g("gochujang (45 g)", 2.5, "tbsp")]);
  assert.equal(bad.length, 1);
  assert.match(bad[0].detail, /keeps GRAMS as the quantity/);
});

test("gochujang in the documented shape passes", () => {
  assert.deepEqual(gochujangLabelViolations([g("gochujang (1 tbsp)", 20, "g")]), []);
  assert.deepEqual(gochujangLabelViolations([g("gochujang (2.2 tsp)", 15, "g")]), []);
});

test("gochujang with no amount at all is not a label problem", () => {
  assert.deepEqual(gochujangLabelViolations([g("gochujang, to taste", null, null)]), []);
});

test("parseIngredientRows rejects both, so PostgREST is not the only guard", () => {
  assert.throws(
    () => parseIngredientRows([{ item: "Brown rice, long-grain, DRY", quantity: 150, unit: "g" }]),
    (e: unknown) => e instanceof RecipeShapeError && /go annotation renders/.test(String(e)),
  );
  assert.throws(
    () => parseIngredientRows([{ item: "Gochujang", quantity: 60, unit: "g" }]),
    (e: unknown) => e instanceof RecipeShapeError && /spoon in its\s+label/.test(String(e)),
  );
});

test("a correct row survives the whole parse", () => {
  const rows = parseIngredientRows([
    { item: "dry white rice, long-grain", quantity: 60, unit: "g" },
    { item: "gochujang (1 tbsp)", quantity: 20, unit: "g" },
  ]);
  assert.equal(rows?.length, 2);
});
