// Unit tests for the fdc_id pin audit (lib/nutrition/recipe-audit.ts).
// Run with: node --experimental-strip-types --test src/__tests__/pin-audit.test.ts
//
// WHY THIS EXISTS
//
// A wrong `fdc_id` is invisible. The arithmetic is right, the totals look plausible, and nothing
// in the app ever contradicts it — so all three known occurrences were found by a person happening
// to look, never by tooling:
//
//   * #672 — gochujang priced as SRIRACHA and as CONDENSED BLACK BEAN SOUP.
//   * #707 — `frozen blueberries` pinned to "Avocados, raw, California".
//   * this check's first run — `scallions` pinned to "Onions, CANNED, solids and liquids".
//
// #707 is the one that shows why it matters: the pin had never been spent, the stored macros came
// from the right food, and every number on the page was correct. It was a landmine, not an error —
// re-resolving would have taken the recipe from 256 to 321 kcal and 2.1 to 9.9 g fat.
//
// Every description below is the real USDA text for that id, fetched from the FDC API, and every
// `item` is the real stored string. The check's only job is to work on these exact pairs.

import test from "node:test";
import assert from "node:assert/strict";

import {
  auditPins,
  pinInconsistencies,
  pinnedFdcIds,
  resolvePinDescriptions,
  SUBSTITUTION_NOTE,
  type Row,
} from "../lib/nutrition/recipe-audit.ts";
import type { RecipeIngredient } from "../lib/types.ts";

/** Real USDA descriptions, keyed by the id the library pins. */
const USDA: Record<number, string> = {
  171706: "Avocados, raw, California",
  173950: "Blueberries, frozen, unsweetened (Includes foods for USDA's Food Distribution Program)",
  167755: "Raspberries, raw",
  168209: "Raspberries, frozen, red, unsweetened",
  170903: "Yogurt, Greek, plain, lowfat",
  171312: "Yogurt, Greek, nonfat, plain, CHOBANI",
  170003: "Onions, canned, solids and liquids",
  170005: "Onions, spring or scallions (includes tops and bulb)",
  170845: "Cheese, mozzarella, whole milk",
  171188: "Sauce, ready-to-serve, pepper or hot",
  2113732: "SUNCHANG GOCHUJANG RED PEPPER PASTE, MEDIUM HOT",
  171077: "Chicken, broilers or fryers, breast, meat only, raw",
  169703: "Rice, brown, long-grain, raw",
  170106: "Peppers, hot chili, red, raw",
  172232: "Basil, fresh",
};

const row = (name: string, ingredients: RecipeIngredient[]): Row => ({
  id: name,
  name,
  ingredients_json: ingredients,
  steps_json: null,
  instructions: null,
  typical_portions: 1,
  calories: 400,
  macros_computed_at: "2026-08-26T00:00:00Z",
  metadata: null,
});

const describe = (id: number) => USDA[id];
const run = (name: string, ings: RecipeIngredient[]) => auditPins([row(name, ings)], describe);

// ── The defects ─────────────────────────────────────────────────────────────

test("#707: frozen blueberries pinned to the avocado record is flagged", () => {
  const f = run("Yogurt + Berries + Whey (lean)", [
    { item: "frozen blueberries (35 g)", quantity: 0.25, unit: "cup", fdc_id: 171706 },
  ]);
  assert.equal(f.length, 1);
  assert.equal(f[0].kind, "pin-wrong-food");
  assert.match(f[0].detail, /Avocados, raw, California/);
});

test("first-run find: scallions pinned to CANNED onions is flagged", () => {
  const f = run("Shrimp Kimchi Fried Rice", [
    { item: "scallions", quantity: 30, unit: "g", fdc_id: 170003 },
  ]);
  assert.equal(f.length, 1);
  assert.equal(f[0].kind, "pin-wrong-food");
});

test("#672: gochujang priced as hot sauce is flagged", () => {
  const f = run("Gochujang Beef", [
    { item: "gochujang (3 tbsp)", quantity: 60, unit: "g", fdc_id: 171188 },
  ]);
  assert.equal(f.length, 1);
  assert.equal(f[0].kind, "pin-wrong-food");
});

// ── The state axis — what the head-noun check cannot see ────────────────────

test("#707: nonfat line pinned to a LOWFAT record is flagged on the fat axis", () => {
  // Both are yogurt, so the head-noun check passes them. The error is in the grade, and at 170 g
  // it is the difference between 0.41 g and 3.26 g of fat.
  const f = run("Yogurt + Berries + Whey (lean)", [
    { item: "plain nonfat Greek yogurt (170 g)", quantity: 0.75, unit: "cup", fdc_id: 170903 },
  ]);
  assert.equal(f.length, 1);
  assert.equal(f[0].kind, "pin-wrong-state");
  assert.match(f[0].detail, /nonfat but .* is lowfat \(fat level\)/);
});

test("#707: frozen line pinned to the RAW record is flagged on the form axis", () => {
  const f = run("Yogurt + Berries + Whey (lean)", [
    { item: "frozen raspberries (35 g)", quantity: 0.25, unit: "cup", fdc_id: 167755 },
  ]);
  assert.equal(f.length, 1);
  assert.equal(f[0].kind, "pin-wrong-state");
  assert.match(f[0].detail, /frozen but .* is raw \(form\)/);
});

// ── The corrected pins, and everything else that must stay quiet ────────────

test("the corrected #707 pins produce no findings", () => {
  const f = run("Yogurt + Berries + Whey (lean)", [
    { item: "plain nonfat Greek yogurt (170 g)", quantity: 0.75, unit: "cup", fdc_id: 171312 },
    { item: "frozen blueberries (35 g)", quantity: 0.25, unit: "cup", fdc_id: 173950 },
    { item: "frozen raspberries (35 g)", quantity: 0.25, unit: "cup", fdc_id: 168209 },
  ]);
  assert.deepEqual(f, []);
});

test("a deliberately pinned BRANDED record is not a defect", () => {
  // 20260823120000 pins gochujang to SUNCHANG *because* USDA has no generic record, and notes that
  // isPlausibleMatch rejects branded results. Re-applying that rule here would report four correct
  // pins every week, and a report that is always on gets muted.
  const f = run("Gochujang Chicken", [
    { item: "gochujang (3 tbsp)", quantity: 60, unit: "g", fdc_id: 2113732 },
  ]);
  assert.deepEqual(f, []);
});

test("a parenthetical carrying the USDA name is what bridges the match", () => {
  // "Thai chilies" shares no word with "Peppers, hot chili, red, raw". The library's convention of
  // putting the USDA name in the parenthetical is the only thing connecting them.
  const f = run("Pad Krapow Gai", [
    { item: "Thai chilies (peppers, hot chili, red, raw)", quantity: 5, unit: "g", fdc_id: 170106 },
    { item: "Thai basil (priced as basil, fresh)", quantity: 20, unit: "g", fdc_id: 172232 },
  ]);
  assert.deepEqual(f, []);
});

test("dry vs raw is the same food said two ways, not a contradiction", () => {
  // `dry`/`dried`/`fresh` are deliberately outside the form axis. Including them turned a silent
  // check into a noisy one on the real library.
  const f = run("Gochujang Chicken", [
    { item: "dry brown rice, long-grain", quantity: 150, unit: "g", fdc_id: 169703 },
  ]);
  assert.deepEqual(f, []);
});

test("a line that declares no state disagrees with nothing", () => {
  const f = run("Gochujang Chicken", [
    { item: "Chicken breast raw", quantity: 1149, unit: "g", fdc_id: 171077 },
    { item: "chicken breast, boneless skinless", quantity: 200, unit: "g", fdc_id: 171077 },
  ]);
  assert.deepEqual(f, []);
});

// ── The escape hatch ────────────────────────────────────────────────────────

test("a note explaining the substitution silences the finding", () => {
  const ing: RecipeIngredient = {
    item: "burrata",
    quantity: 113,
    unit: "g",
    fdc_id: 170845,
    note: "4 oz; priced on whole-milk mozzarella - USDA has no burrata record",
  };
  assert.deepEqual(run("Salmon Burrata Pasta", [ing]), []);

  // Strip the note and the same pin is reported — the note is doing the work, not the food.
  const bare = run("Salmon Burrata Pasta", [{ ...ing, note: null }]);
  assert.equal(bare.length, 1);
  assert.equal(bare[0].kind, "pin-wrong-food");
});

test("SUBSTITUTION_NOTE matches the phrasings the library actually uses", () => {
  for (const note of [
    "priced on whole-milk mozzarella - USDA has no burrata record",
    "HOLY BASIL (krapow) IS THE AUTHENTIC HERB and has no USDA record; sweet basil is priced here",
    "NO USDA RECORD EXISTS - grams lead per the dual-unit rule",
    "closest USDA record",
    "substituted for the real thing",
  ]) {
    assert.ok(SUBSTITUTION_NOTE.test(note), note);
  }
  assert.ok(!SUBSTITUTION_NOTE.test("1.4 oz - half in the pot, half raw on top at the end."));
});

// ── Plumbing ────────────────────────────────────────────────────────────────

test("an id that will not resolve is skipped, not reported", () => {
  // A rate limit is not a data defect, and reporting one as though it were would be lying about
  // the library.
  const f = auditPins(
    [row("X", [{ item: "frozen blueberries", quantity: 35, unit: "g", fdc_id: 171706 }])],
    () => undefined,
  );
  assert.deepEqual(f, []);
});

test("pinnedFdcIds returns each id once across the whole library", () => {
  const ids = pinnedFdcIds([
    row("A", [
      { item: "a", quantity: 1, unit: "g", fdc_id: 171077 },
      { item: "b", quantity: 1, unit: "g", fdc_id: 171077 },
      { item: "c", quantity: 1, unit: "g", fdc_id: null },
    ]),
    row("B", [{ item: "d", quantity: 1, unit: "g", fdc_id: 170003 }]),
  ]);
  assert.deepEqual(ids.sort(), [170003, 171077]);
});

test("resolvePinDescriptions keeps going when one lookup throws", () => {
  return (async () => {
    const map = await resolvePinDescriptions([171077, 999999, 170003], async (id) => {
      if (id === 999999) throw new Error("FDC 404");
      return { description: USDA[id] };
    });
    assert.equal(map.size, 2);
    assert.equal(map.get(171077), USDA[171077]);
    assert.ok(!map.has(999999));
  })();
});

// ── One food, two pins ──────────────────────────────────────────────────────

test("the same food pinned two ways is flagged, whichever way is right", () => {
  // The wording stays neutral on purpose. This finds two different shapes — a genuine mis-pin
  // (scallions vs canned onions) and two duplicate USDA records for one food (garlic 169230 and
  // 1104647 are both "Garlic, raw") — and only a human can tell which is which.
  // The real scallion defect. 170003 shares the word "onion" with the line, so the description
  // check passes it — the disagreement is the only visible signal.
  const f = pinInconsistencies([
    row("Kimchi Jjigae", [{ item: "Scallions", quantity: 40, unit: "g", fdc_id: 170005 }]),
    row("Shrimp Kimchi Fried Rice", [
      { item: "scallions", quantity: 30, unit: "g", fdc_id: 170003 },
    ]),
  ]);
  assert.equal(f.length, 1);
  assert.equal(f[0].kind, "pin-inconsistent");
  assert.equal(f[0].recipe, "(library)");
  assert.match(f[0].detail, /170005 \(1x\) vs 170003 \(1x\)|170003 \(1x\) vs 170005 \(1x\)/);
});

test("the majority pin is named first, so the odd one out is obvious", () => {
  const f = pinInconsistencies([
    row("A", [
      { item: "chicken breast, boneless skinless", quantity: 200, unit: "g", fdc_id: 171077 },
    ]),
    row("B", [{ item: "Chicken breast raw", quantity: 200, unit: "g", fdc_id: 171077 }]),
    row("C", [{ item: "chicken breast", quantity: 200, unit: "g", fdc_id: 171052 }]),
  ]);
  assert.equal(f.length, 1);
  assert.match(f[0].detail, /171077 \(2x\) vs 171052 \(1x\)/);
});

test("differently-worded lines for one food are the SAME food, not two", () => {
  // If normalization did not collapse these, every recipe would look inconsistent with every other.
  const f = pinInconsistencies([
    row("A", [
      { item: "chicken breast, boneless skinless", quantity: 200, unit: "g", fdc_id: 171077 },
    ]),
    row("B", [{ item: "Chicken breast raw", quantity: 1149, unit: "g", fdc_id: 171077 }]),
  ]);
  assert.deepEqual(f, []);
});

test("one food pinned one way is silent no matter how many recipes use it", () => {
  const rows = Array.from({ length: 17 }, (_, i) =>
    row(`R${i}`, [{ item: "garlic", quantity: 10, unit: "g", fdc_id: 169230 }]),
  );
  assert.deepEqual(pinInconsistencies(rows), []);
});

test("unpinned lines are ignored — that backlog is reported elsewhere", () => {
  const f = pinInconsistencies([
    row("A", [{ item: "scallions", quantity: 30, unit: "g", fdc_id: null }]),
    row("B", [{ item: "scallions", quantity: 30, unit: "g", fdc_id: 170005 }]),
  ]);
  assert.deepEqual(f, []);
});
