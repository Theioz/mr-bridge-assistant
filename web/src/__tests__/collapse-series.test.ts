// Unit tests for collapsing a recurring series to a single row.
//
// WHY THIS EXISTS
//
// The spawner materializes occurrences a fortnight ahead (#468), and the tasks list rendered every
// one as its own row. Five "Water the plants" rows read as five chores, not one recurring chore —
// the repeat was expressed as duplication rather than as a property of a task. It also made the
// verbs ambiguous: archiving the whole visible window LOOKS like stopping the chore, but the next
// window just repopulates.
//
// The failure mode of this collapse is quiet and wrong-looking-right: show the newest occurrence
// instead of the oldest and being three days behind reads as being on top of things; count future
// occurrences as "missed" and every series looks permanently overdue. Both produce a plausible
// list. So the ordering and the counting are pinned here.

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { collapseSeriesOccurrences } from "../lib/tasks/collapse.ts";
import type { Task } from "../lib/types.ts";

const TODAY = "2026-08-24";

const task = (o: Partial<Task> & { id: string }): Task =>
  ({
    title: "Water the plants",
    priority: null,
    status: "active",
    due_date: o.occurrence_date ?? null,
    category: null,
    list_id: null,
    calendar_event_id: null,
    scheduled_start: null,
    scheduled_end: null,
    scheduled_all_day: false,
    completed_at: null,
    created_at: "2026-08-01",
    parent_id: null,
    series_id: null,
    occurrence_date: null,
    ...o,
  }) as Task;

describe("collapseSeriesOccurrences", () => {
  it("shows one row per series, and it is the OLDEST outstanding occurrence", () => {
    const rows = collapseSeriesOccurrences(
      [
        task({ id: "d", series_id: "S", occurrence_date: "2026-08-27" }),
        task({ id: "a", series_id: "S", occurrence_date: "2026-08-18" }),
        task({ id: "b", series_id: "S", occurrence_date: "2026-08-21" }),
        task({ id: "c", series_id: "S", occurrence_date: "2026-08-24" }),
      ],
      TODAY,
    );
    assert.equal(rows.length, 1);
    // Newest-first would make three days behind look like being up to date.
    assert.equal(rows[0].id, "a");
  });

  it("counts only occurrences that were actually due as missed", () => {
    const rows = collapseSeriesOccurrences(
      [
        task({ id: "a", series_id: "S", occurrence_date: "2026-08-18" }),
        task({ id: "b", series_id: "S", occurrence_date: "2026-08-21" }),
        task({ id: "c", series_id: "S", occurrence_date: "2026-08-24" }),
        task({ id: "future", series_id: "S", occurrence_date: "2026-08-27" }),
      ],
      TODAY,
    );
    // Three were due (18th, 21st, today); the visible row is one of them, so two sit behind it.
    // The 27th has simply not come round yet and must not inflate the badge.
    assert.equal(rows[0].missedCount, 2);
    assert.equal(rows[0].seriesActiveCount, 4);
  });

  it("treats an occurrence due today as due, not future", () => {
    const rows = collapseSeriesOccurrences(
      [
        task({ id: "x", series_id: "S", occurrence_date: "2026-08-21" }),
        task({ id: "y", series_id: "S", occurrence_date: TODAY }),
      ],
      TODAY,
    );
    assert.equal(rows[0].missedCount, 1);
  });

  it("badges nothing when every occurrence is still ahead", () => {
    const rows = collapseSeriesOccurrences(
      [
        task({ id: "f1", series_id: "S", occurrence_date: "2026-08-27" }),
        task({ id: "f2", series_id: "S", occurrence_date: "2026-08-30" }),
      ],
      TODAY,
    );
    assert.equal(rows.length, 1);
    assert.equal(rows[0].id, "f1");
    assert.equal(rows[0].missedCount, 0);
  });

  it("leaves one-off tasks alone and keeps separate series separate", () => {
    const rows = collapseSeriesOccurrences(
      [
        task({ id: "one", title: "Call the bank" }),
        task({ id: "a1", series_id: "A", occurrence_date: "2026-08-24" }),
        task({ id: "a2", series_id: "A", occurrence_date: "2026-08-27" }),
        task({
          id: "b1",
          title: "Dose the aquarium",
          series_id: "B",
          occurrence_date: "2026-08-30",
        }),
      ],
      TODAY,
    );
    assert.equal(rows.length, 3);
    assert.equal(rows.find((r) => r.id === "one")!.missedCount, 0);
    assert.equal(rows.find((r) => r.series_id === "A")!.id, "a1");
    assert.equal(rows.find((r) => r.series_id === "B")!.id, "b1");
  });

  it("keeps a detached occurrence as its own row — that is what detaching is for", () => {
    // "This occurrence, not the series" clears series_id (#468), so the row must survive the
    // collapse independently rather than being folded back into the series it left.
    const rows = collapseSeriesOccurrences(
      [
        task({ id: "detached", title: "Water the plants (moved to Tuesday)" }),
        task({ id: "s1", series_id: "A", occurrence_date: "2026-08-27" }),
      ],
      TODAY,
    );
    assert.equal(rows.length, 2);
  });

  it("handles an empty list", () => {
    assert.deepEqual(collapseSeriesOccurrences([], TODAY), []);
  });
});
