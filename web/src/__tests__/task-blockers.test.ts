// Unit tests for the read side of task dependencies (#470).
//
// The quiet failure here is a task that stays hidden. Treat an archived blocker as blocking and
// dropping the blocker hides the dependent forever, with nothing on screen saying why.

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { isBlocked, partitionBlocked } from "../lib/tasks/blockers.ts";

const blocker = (status: string) => ({ id: "b", title: "Submit expense report", status });

describe("isBlocked", () => {
  it("an active blocker blocks", () =>
    assert.equal(isBlocked({ blocker: blocker("active") }), true));
  it("a completed blocker releases", () =>
    assert.equal(isBlocked({ blocker: blocker("completed") }), false));
  it("an archived blocker releases", () =>
    assert.equal(isBlocked({ blocker: blocker("archived") }), false));
  it("no blocker, or a deleted one (null embed), is not blocked", () => {
    assert.equal(isBlocked({}), false);
    assert.equal(isBlocked({ blocker: null }), false);
  });
});

describe("partitionBlocked", () => {
  it("keeps order within each side", () => {
    const tasks = [
      { id: "1", blocker: null },
      { id: "2", blocker: blocker("active") },
      { id: "3", blocker: blocker("completed") },
      { id: "4", blocker: blocker("active") },
    ];
    const { ready, blocked } = partitionBlocked(tasks);
    assert.deepEqual(
      ready.map((t) => t.id),
      ["1", "3"],
    );
    assert.deepEqual(
      blocked.map((t) => t.id),
      ["2", "4"],
    );
  });
});
