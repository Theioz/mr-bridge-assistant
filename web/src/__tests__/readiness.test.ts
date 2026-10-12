// Unit tests for the shared readiness rule (lib/readiness.ts).
// Run with: node --experimental-strip-types --test src/__tests__/readiness.test.ts
// (from the web/ directory)
//
// On 2026-10-12 the dashboard showed readiness 57 "moderate effort" and readiness 53 "consider
// deload" at the same time, from two rows and two copies of the band table. The page now reads
// one row; these tests pin the one band table every readiness label comes from.

import assert from "node:assert/strict";
import { test } from "node:test";
import { readinessAdvice, readinessFlagged, readinessText } from "../lib/readiness.ts";

test("band edges", () => {
  assert.equal(readinessAdvice(85)?.band, "optimal");
  assert.equal(readinessAdvice(84)?.band, "good");
  assert.equal(readinessAdvice(70)?.band, "good");
  assert.equal(readinessAdvice(69)?.band, "moderate");
  assert.equal(readinessAdvice(55)?.band, "moderate");
  assert.equal(readinessAdvice(54)?.band, "low");
  assert.equal(readinessAdvice(40)?.band, "low");
  assert.equal(readinessAdvice(39)?.band, "critical");
  assert.equal(readinessAdvice(0)?.band, "critical");
});

test("the walkthrough scores read as their bands", () => {
  assert.equal(readinessText(57), "moderate · moderate effort");
  assert.equal(readinessText(53), "low · consider deload");
});

test("no score is no advice, not a band", () => {
  assert.equal(readinessAdvice(null), null);
  assert.equal(readinessAdvice(undefined), null);
  assert.equal(readinessText(null), "—");
  assert.equal(readinessFlagged(null), false);
});

test("the flag edge is the low band's edge", () => {
  assert.equal(readinessFlagged(55), false);
  assert.equal(readinessFlagged(54), true);
});
