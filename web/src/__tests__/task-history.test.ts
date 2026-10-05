// Unit tests for completed-task history and retention (#684).
//
// WHY THIS EXISTS
//
// Both failure modes here produce a plausible screen. Group a 10 PM completion by UTC and it files
// under tomorrow, so "Yesterday" quietly holds the wrong tasks. Move the retention floor and the
// spawners start re-creating chores the purge just deleted, as overdue tasks nobody can explain.

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { groupCompletedByDay } from "../lib/tasks/history.ts";
import { COMPLETED_RETENTION_DAYS, retentionFloor } from "../lib/tasks/retention.ts";

const LA = "America/Los_Angeles";
const t = (id: string, completed_at: string | null) => ({ id, completed_at });

describe("groupCompletedByDay", () => {
  it("files a late-evening completion under the user's day, not UTC's", () => {
    // 05:30Z on Oct 5 is 22:30 on Oct 4 in Los Angeles.
    const groups = groupCompletedByDay([t("a", "2026-10-05T05:30:00Z")], LA, "2026-10-05");
    assert.equal(groups.length, 1);
    assert.equal(groups[0].day, "2026-10-04");
    assert.equal(groups[0].label, "Yesterday");
  });

  it("labels today, yesterday, then dates, newest day first", () => {
    const groups = groupCompletedByDay(
      [
        t("old", "2026-09-10T18:00:00Z"),
        t("today", "2026-10-05T18:00:00Z"),
        t("yday", "2026-10-04T18:00:00Z"),
      ],
      LA,
      "2026-10-05",
    );
    assert.deepEqual(
      groups.map((g) => g.label),
      ["Today", "Yesterday", "Thu, Sep 10"],
    );
  });

  it("keeps input order within a day and skips rows with no completed_at", () => {
    const groups = groupCompletedByDay(
      [t("b", "2026-10-05T20:00:00Z"), t("x", null), t("a", "2026-10-05T16:00:00Z")],
      LA,
      "2026-10-05",
    );
    assert.equal(groups.length, 1);
    assert.deepEqual(
      groups[0].tasks.map((r) => r.id),
      ["b", "a"],
    );
  });
});

describe("retentionFloor", () => {
  it("is COMPLETED_RETENTION_DAYS calendar days back, across a month boundary", () => {
    assert.equal(COMPLETED_RETENTION_DAYS, 90);
    assert.equal(retentionFloor(new Date(2026, 9, 5, 12)), "2026-07-07");
  });
});
