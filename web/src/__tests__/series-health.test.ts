// Unit tests for silent-series detection (#703). The same cases as tests/test_series_health.py,
// so the page and the nightly spawner cannot disagree about which chore has vanished.
//
// Both mistakes are quiet: miss a skipped-out series and a chore disappears with a clean log; flag
// a healthy monthly chore and the notice becomes noise.

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { isSilent } from "../lib/tasks/series-health.ts";

const WINDOW = ["2026-10-06", "2026-10-13"];
const row = (status: string, occurrence_date: string) => ({ status, occurrence_date });

describe("isSilent", () => {
  it("every in-window date skipped is silent", () => {
    assert.equal(
      isSilent(WINDOW, [row("archived", "2026-10-06"), row("archived", "2026-10-13")]),
      true,
    );
  });
  it("never materialized is silent", () => {
    assert.equal(isSilent(WINDOW, []), true);
  });
  it("an active occurrence is not silent", () => {
    assert.equal(
      isSilent(WINDOW, [row("archived", "2026-10-06"), row("active", "2026-10-13")]),
      false,
    );
  });
  it("an overdue active occurrence still shows on the list", () => {
    assert.equal(
      isSilent(WINDOW, [row("active", "2026-09-29"), row("archived", "2026-10-06")]),
      false,
    );
  });
  it("completed early is on top of it", () => {
    assert.equal(
      isSilent(WINDOW, [row("completed", "2026-10-06"), row("archived", "2026-10-13")]),
      false,
    );
  });
  it("a completed date outside the window does not count", () => {
    assert.equal(
      isSilent(WINDOW, [row("completed", "2026-09-29"), row("archived", "2026-10-06")]),
      true,
    );
  });
  it("nothing due in the window is not silent", () => {
    assert.equal(isSilent([], []), false);
  });
});
