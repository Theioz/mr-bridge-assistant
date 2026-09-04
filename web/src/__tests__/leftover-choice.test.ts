// Unit tests for chooseCookToSpend (lib/nutrition/leftover-choice.ts).
//
// WHY THIS EXISTS
//
// "Ate it" on a recipe-backed plan used to call createCook UNCONDITIONALLY. Cooking a batch and
// then logging a serving from it therefore produced TWO trays. Observed 2026-09-04: a 4-portion
// pasta batch recorded through the Cook It dialog at 17:54:20 (with its inventory draws) was
// followed 2.1 s later by "Ate it" on that day's lunch plan, which created a second 4-portion
// cook with no draws. The fridge reported 7 portions of a 4-portion batch, and the serving came
// off the phantom tray while the real one stayed full.
//
// Phantom portions are the damaging direction: getLeftovers is what the planner reads to decide
// there is nothing to shop for.

import test from "node:test";
import assert from "node:assert/strict";

import { chooseCookToSpend } from "../lib/nutrition/leftover-choice.ts";

const tray = (id: string, portions_remaining: number, cooked_on: string | null = "2026-09-04") => ({
  id,
  portions_remaining,
  cooked_on,
});

test("the batch already in the fridge is spent — nothing new gets cooked", () => {
  // The exact 2026-09-04 case: a real 4-portion pasta tray exists.
  assert.equal(chooseCookToSpend([tray("cook-real", 4)], 1)?.id, "cook-real");
});

test("an empty fridge returns null, so the caller cooks", () => {
  assert.equal(chooseCookToSpend([], 1), null);
  assert.equal(chooseCookToSpend([tray("spent", 0)], 1), null);
});

test("oldest first — the tray with the nearest deadline is spent", () => {
  const picked = chooseCookToSpend(
    [tray("new", 4, "2026-09-06"), tray("old", 4, "2026-09-02"), tray("mid", 4, "2026-09-04")],
    1,
  );
  assert.equal(picked?.id, "old");
});

test("a tray too small for the serving is passed over, not drawn below zero", () => {
  // eatFromCook would reject this outright; choosing it would only produce a failed log.
  assert.equal(chooseCookToSpend([tray("half", 0.5)], 1), null);
  assert.equal(chooseCookToSpend([tray("one", 1)], 2), null);
  assert.equal(chooseCookToSpend([tray("two", 2)], 2)?.id, "two");
});

test("a big-enough newer tray beats an older one that cannot cover the serving", () => {
  const picked = chooseCookToSpend([tray("old", 1, "2026-09-01"), tray("new", 4, "2026-09-05")], 2);
  assert.equal(picked?.id, "new", "age does not override being able to cover the serving");
});

test("an undated tray sorts last but is still usable", () => {
  assert.equal(
    chooseCookToSpend([tray("undated", 4, null), tray("dated", 4, "2026-09-03")], 1)?.id,
    "dated",
  );
  assert.equal(chooseCookToSpend([tray("undated", 4, null)], 1)?.id, "undated");
});

test("a non-numeric or missing remaining count is never spent", () => {
  // portions_remaining arrives from postgres as a string on some drivers; a null or a NaN must
  // not read as "plenty".
  assert.equal(
    chooseCookToSpend([{ id: "x", portions_remaining: null, cooked_on: null }], 1),
    null,
  );
  assert.equal(
    chooseCookToSpend([{ id: "x", portions_remaining: "not a number", cooked_on: null }], 1),
    null,
  );
  assert.equal(
    chooseCookToSpend([{ id: "x", portions_remaining: "4", cooked_on: null }], 1)?.id,
    "x",
  );
});

test("a nonsense serving size selects nothing rather than the first tray", () => {
  assert.equal(chooseCookToSpend([tray("real", 4)], 0), null);
  assert.equal(chooseCookToSpend([tray("real", 4)], -1), null);
});
