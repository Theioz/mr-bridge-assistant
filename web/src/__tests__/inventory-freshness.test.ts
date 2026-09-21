// Unit tests for inventory freshness (nutrition/inventory-freshness.ts).
// Run with: node --experimental-strip-types --test src/__tests__/inventory-freshness.test.ts
// (from the web/ directory)
//
// WHY THIS EXISTS
//
// On 2026-09-21 the "Use soon" strip showed 16 rows. Fourteen were at 0 g — food eaten or
// thrown out weeks earlier, kept only for the notes on the row. Zero rows on it were real
// food. The classifier read `expires_on` and never `quantity`, and `days <= USE_SOON_DAYS`
// has no lower bound, so a spent row stayed urgent forever and got more urgent-looking with
// age.
//
// The trap on the fix is the NULL case: a NULL quantity is an untracked STAPLE that is
// assumed on hand (rice, oil, whey), NOT an empty row. Treating NULL as zero would delete
// every staple from the kitchen view — the opposite bug, and a quieter one.

import assert from "node:assert/strict";
import { test } from "node:test";
import {
  freshnessOf,
  isSpent,
  useSoonItems,
  daysText,
} from "../lib/nutrition/inventory-freshness.ts";

const TODAY = new Date("2026-09-21T09:00:00");
const row = (o: Partial<Parameters<typeof freshnessOf>[0]> = {}) => ({
  quantity: 100,
  location: "fridge",
  expires_on: null,
  ...o,
});

test("a spent row is never urgent, however far past its date", () => {
  // The real shape: shiitake at 0 g, expired 2026-08-02, 50 days stale.
  const spent = row({ quantity: 0, expires_on: "2026-08-02" });
  assert.equal(freshnessOf(spent, TODAY).kind, "spent");
  assert.equal(freshnessOf(spent, TODAY).days, null);
});

test("a NULL quantity is a staple on hand, not an empty row", () => {
  assert.equal(isSpent(row({ quantity: null })), false);
  assert.equal(freshnessOf(row({ quantity: null }), TODAY).kind, "stable");
});

test("only an explicit zero counts as spent", () => {
  assert.equal(isSpent(row({ quantity: 0 })), true);
  assert.equal(isSpent(row({ quantity: 0.5 })), false);
  assert.equal(isSpent(row({ quantity: null })), false);
});

test("real food still goes urgent inside the window, and past it", () => {
  assert.equal(freshnessOf(row({ expires_on: "2026-09-23" }), TODAY).kind, "urgent");
  assert.equal(freshnessOf(row({ expires_on: "2026-09-20" }), TODAY).kind, "urgent");
  assert.equal(freshnessOf(row({ expires_on: "2026-09-30" }), TODAY).kind, "fine");
});

test("frozen beats the fridge clock, but spent beats frozen", () => {
  assert.equal(
    freshnessOf(row({ location: "freezer", expires_on: "2026-09-01" }), TODAY).kind,
    "frozen",
  );
  assert.equal(
    freshnessOf(row({ quantity: 0, location: "freezer", expires_on: "2026-09-01" }), TODAY).kind,
    "spent",
  );
});

test("the strip holds only real food, soonest first — the 2026-09-21 regression", () => {
  const items = [
    row({ quantity: 0, expires_on: "2026-08-02" }), // shiitake, gone
    row({ quantity: 0, expires_on: "2026-09-12" }), // red pepper, gone
    row({ quantity: 454, expires_on: "2026-09-22" }), // ground beef, real
    row({ quantity: null }), // staple
    row({ quantity: 567, expires_on: "2026-09-21" }), // thighs, real, sooner
  ];
  const strip = useSoonItems(items, TODAY);
  assert.equal(strip.length, 2);
  assert.deepEqual(
    strip.map((i) => i.expires_on),
    ["2026-09-21", "2026-09-22"],
  );
});

test("daysText still reads plainly at the boundaries", () => {
  assert.equal(daysText(-1), "expired");
  assert.equal(daysText(0), "today");
  assert.equal(daysText(3), "3d");
});
