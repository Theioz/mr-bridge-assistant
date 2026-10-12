// Unit tests for the re-entry signal (lib/reentry.ts).
// Run with: node --experimental-strip-types --test src/__tests__/reentry.test.ts
// (from the web/ directory)
//
// The dashboard's "Welcome back. Start from today." card and the get_logging_status MCP tool
// both read this. The edges matter: a card a day early is noise, a card that never shows is the
// GA finding (#761) all over again — hand logging stopped while the synced numbers kept the
// dashboard looking busy.

import assert from "node:assert/strict";
import { test } from "node:test";
import { computeReentry, latestLoggedDate, REENTRY_QUIET_DAYS } from "../lib/reentry.ts";

const TODAY = "2026-10-12";

test("threshold is three days", () => {
  assert.equal(REENTRY_QUIET_DAYS, 3);
});

test("logged today → not re-entry", () => {
  assert.deepEqual(computeReentry(["2026-10-12", null, "2026-10-01", null], TODAY), {
    lastHandLoggedOn: "2026-10-12",
    quietDays: 0,
    reentry: false,
  });
});

test("two quiet days → not yet", () => {
  const s = computeReentry(["2026-10-10"], TODAY);
  assert.equal(s.quietDays, 2);
  assert.equal(s.reentry, false);
});

test("three quiet days → re-entry", () => {
  const s = computeReentry(["2026-10-09"], TODAY);
  assert.equal(s.quietDays, 3);
  assert.equal(s.reentry, true);
});

test("the GA case: everything stopped Sep 24", () => {
  const s = computeReentry(["2026-09-24", "2026-09-22", "2026-09-10", "2026-09-24"], TODAY);
  assert.deepEqual(s, { lastHandLoggedOn: "2026-09-24", quietDays: 18, reentry: true });
});

test("the newest table wins — one recent habit tick is enough", () => {
  const s = computeReentry(["2026-09-24", "2026-10-11", null, "2026-08-01"], TODAY);
  assert.equal(s.lastHandLoggedOn, "2026-10-11");
  assert.equal(s.reentry, false);
});

test("never logged is NOT re-entry (no 'welcome back' on a fresh install)", () => {
  assert.deepEqual(computeReentry([null, undefined, null], TODAY), {
    lastHandLoggedOn: null,
    quietDays: null,
    reentry: false,
  });
});

test("future-dated rows are ignored, not treated as activity", () => {
  assert.equal(latestLoggedDate(["2026-10-13", "2026-09-30"], TODAY), "2026-09-30");
  assert.equal(computeReentry(["2026-10-20"], TODAY).reentry, false); // nothing usable
});

test("timestamps and garbage are tolerated", () => {
  assert.equal(latestLoggedDate(["2026-10-01T08:00:00Z", "not a date", ""], TODAY), "2026-10-01");
});

test("month and DST boundaries count calendar days", () => {
  assert.equal(computeReentry(["2026-10-30"], "2026-11-02").quietDays, 3); // DST ends Nov 1
  assert.equal(computeReentry(["2026-02-27"], "2026-03-02").quietDays, 3);
});

test("custom threshold", () => {
  assert.equal(computeReentry(["2026-10-11"], TODAY, 1).reentry, true);
});
