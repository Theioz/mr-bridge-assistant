// Unit tests for stepRowsFrom's sentence fallback.
//
// WHY THIS EXISTS
//
// The original splitter broke only on newlines. That is correct for the 49 recipes written as
// line-per-step, and a silent no-op for every recipe written as one paragraph — which produced a
// single "step" containing the whole blob, reported as a successful backfill. The strings below
// are the real `instructions` values of the four recipes on the 2026-08-13 meal plan, all four of
// which landed in that broken set.

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { stepRowsFrom } from "../lib/nutrition/recipe-backfill.ts";

const LAMB_PASTA =
  "BATCH OF 2 - macros above are ONE SERVING. Sweat onion and garlic in the oil, add crushed " +
  "tomatoes and reduce ~10 min. Fold in the lamb chunks LAST and off the heat - it is already " +
  "cooked and will go tough if simmered. Wilt the spinach in. Toss with the pasta. USDA: lamb " +
  "from cook 7618752d (258 kcal/25.6P/16.5F per 100 g cooked, USDA 174312); pasta dry USDA 168927.";

const SALMON =
  "BATCH OF 2 - macros above are ONE SERVING. Roast Brussels and green beans at 425F ~20 min; " +
  "salmon skin-side down 12-14 min. Cook the salmon the day you eat it if possible - it holds far " +
  "worse than chicken or chili. USDA: salmon Atlantic farmed cooked 175167.";

describe("stepRowsFrom — sentence fallback for single-paragraph instructions", () => {
  it("splits a real one-paragraph recipe into a method instead of one blob", () => {
    const steps = stepRowsFrom(LAMB_PASTA)!;
    assert.equal(steps.length, 4);
    assert.match(steps[0].text, /^Sweat onion and garlic/);
    assert.match(steps[1].text, /^Fold in the lamb chunks LAST/);
    assert.equal(steps[2].text, "Wilt the spinach in.");
    assert.equal(steps[3].text, "Toss with the pasta.");
  });

  it("keeps the USDA audit trail out of the numbered method but does not lose it", () => {
    const steps = stepRowsFrom(LAMB_PASTA)!;
    assert.equal(
      steps.some((s) => /USDA/.test(s.text)),
      false,
      "a citation must never be numbered as a thing to do",
    );
    const tips = steps.flatMap((s) => s.tips ?? []);
    assert.equal(
      tips.some((t) => /USDA 174312/.test(t)),
      true,
      "and must still be reachable as an aside",
    );
  });

  it("attaches a leading BATCH header to the first step, not the last", () => {
    // It is written before any instruction, so hanging it off the final step would read as a
    // closing remark on a recipe whose first line is the one it qualifies.
    const steps = stepRowsFrom(LAMB_PASTA)!;
    assert.match(steps[0].tips![0], /^BATCH OF 2/);
  });

  it("does not split on a mid-sentence semicolon", () => {
    // "425F ~20 min; salmon skin-side down 12-14 min" is one action at one oven temperature.
    const steps = stepRowsFrom(SALMON)!;
    assert.match(steps[0].text, /425F ~20 min; salmon skin-side down 12-14 min\.$/);
  });

  it("leaves newline-separated recipes on the original path", () => {
    // 49 of 72 live recipes are written this way and must not change.
    const steps = stepRowsFrom("Brown the beef.\nAdd aromatics.\nSimmer 40 min.")!;
    assert.deepEqual(
      steps.map((s) => s.text),
      ["Brown the beef.", "Add aromatics.", "Simmer 40 min."],
    );
  });

  it("still prefers blank-line groups over single newlines", () => {
    const steps = stepRowsFrom("Step one\nwrapped line.\n\nStep two.")!;
    assert.equal(steps.length, 2);
    assert.equal(steps[0].text, "Step one\nwrapped line.");
  });

  it("does not break decimals into sentences", () => {
    const steps = stepRowsFrom("Add 1.5 tbsp tomato paste and stir.")!;
    assert.equal(steps.length, 1);
  });

  it("falls back to the raw chunks when every sentence is an aside", () => {
    // Returning nothing would render the recipe as having no method at all — worse than the blob.
    const steps = stepRowsFrom("USDA: chicken 171477. USDA: broccoli 170379.")!;
    assert.equal(steps.length, 2);
    assert.match(steps[0].text, /USDA/);
  });

  it("strips leading numbering, as before", () => {
    const steps = stepRowsFrom("1. Brown the beef.\n2) Add aromatics.")!;
    assert.deepEqual(
      steps.map((s) => s.text),
      ["Brown the beef.", "Add aromatics."],
    );
  });

  it("returns null for empty or whitespace-only instructions", () => {
    assert.equal(stepRowsFrom(null), null);
    assert.equal(stepRowsFrom("   \n  "), null);
  });

  it("renumbers sequentially after asides are pulled out", () => {
    // step is authoritative for render order, so a gap would misnumber the printed method.
    const steps = stepRowsFrom(SALMON)!;
    assert.deepEqual(
      steps.map((s) => s.step),
      steps.map((_, i) => i + 1),
    );
  });
});
