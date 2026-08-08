// Unit tests for parseIngredients (lib/units.ts).
// Run with: node --experimental-strip-types --test src/__tests__/ingredients.test.ts
// (from the web/ directory)
//
// WHY THIS EXISTS
//
// Two separate failures on 2026-08-08, both visible on the same screen:
//
//   1. Eight recipes had a JSON array written into the free-text `ingredients` column by a batch
//      script. The UI rendered it into a `<p>` with `white-space: pre-line`, so the page printed
//      `["Chicken breast, boneless skinless - 255 g", ...]` verbatim. The data was repaired, but a
//      render path that leaks storage syntax when a writer misbehaves will do it again.
//
//   2. Rice is measured in *go* (1 go = 150 g dry) — Jason's actual unit at the bag. The convention
//      was applied by hand and had drifted: 12 recipes carried it, 8 did not. Anything applied by
//      hand to stored text drifts, so it moved to render time.

import { test } from "node:test";
import assert from "node:assert/strict";
import { parseIngredients } from "../lib/units.ts";

test("splits plain newline text into lines", () => {
  const out = parseIngredients("255 g chicken breast\n120 g edamame, shelled");
  assert.equal(out.length, 2);
  assert.match(out[0], /^255 g/);
  assert.match(out[1], /edamame/);
});

test("recovers a JSON array written into the text column", () => {
  const out = parseIngredients(
    '["Chicken breast, boneless skinless - 255 g", "Edamame, shelled - 120 g"]',
  );
  assert.equal(out.length, 2);
  assert.match(out[0], /Chicken breast, boneless skinless - 255 g/);
  // The whole point: no bracket, quote or comma-separator survives into the display string.
  assert.ok(!out.join("").includes('"'), "quotes leaked into the rendered list");
  assert.ok(!out[0].startsWith("["), "bracket leaked into the rendered list");
});

test("text that merely starts with a bracket is not swallowed", () => {
  const out = parseIngredients("[garnish] 15 g scallions\n200 g cabbage");
  assert.equal(out.length, 2);
  assert.match(out[0], /garnish/);
});

test("annotates dry rice with go", () => {
  assert.match(parseIngredients("80 g dry brown rice")[0], /0\.53 go/);
  assert.match(parseIngredients("150 g dry white rice")[0], /1 go/);
});

test("annotates cooked rice with both dry grams and go, by grain", () => {
  // white cooks ~3.0x, brown ~2.75x — the yields differ, so the grain has to be named
  assert.match(parseIngredients("150 g cooked white rice")[0], /~50 g dry = 0\.33 go/);
  assert.match(parseIngredients("150 g cooked brown rice")[0], /~55 g dry = 0\.37 go/);
});

test("cooked rice of unnamed grain is left alone rather than guessed", () => {
  const out = parseIngredients("150 g cooked rice")[0];
  assert.ok(!out.includes("go"), "guessed a yield for an unspecified grain");
});

test("does not double-annotate a line that already carries its go", () => {
  const line = "220 g cooked brown rice (~80 g dry = 0.5 go)";
  const out = parseIngredients(line)[0];
  assert.equal(out.match(/go/g)?.length, 1);
  // and it keeps the hand-written figure rather than substituting a recomputed one
  assert.match(out, /~80 g dry = 0\.5 go/);
});

test("go annotation composes with the imperial conversion", () => {
  const out = parseIngredients("80 g dry brown rice")[0];
  assert.match(out, /2\.8 oz/); // from annotateLine
  assert.match(out, /0\.53 go/); // from annotateRice
});

test("gochujang does not trip the go matcher", () => {
  const out = parseIngredients("20 g gochujang")[0];
  assert.ok(!out.includes(" go)"), "matched 'go' inside gochujang");
});

test("empty and null input yield no rows", () => {
  assert.deepEqual(parseIngredients(""), []);
  assert.deepEqual(parseIngredients(null), []);
  assert.deepEqual(parseIngredients(undefined), []);
  assert.deepEqual(parseIngredients("\n\n  \n"), []);
});
