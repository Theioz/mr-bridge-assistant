// Unit tests for the read side of task dependencies (#470).
//
// The quiet failure here is a task that stays hidden. Treat an archived blocker as blocking and
// dropping the blocker hides the dependent forever, with nothing on screen saying why.

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { isBlocked, nestBlocked, partitionBlocked } from "../lib/tasks/blockers.ts";

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

describe("nestBlocked", () => {
  const ref = (id: string, status = "active") => ({ id, title: id, status });
  it("hangs a blocked task under its blocker, and chains nest", () => {
    const a = { id: "A", blocker: null };
    const b = { id: "B", blocker: ref("A") };
    const c = { id: "C", blocker: ref("B") };
    const { childrenOf, orphans } = nestBlocked([a, b, c]);
    assert.deepEqual(
      childrenOf.get("A")?.map((t) => t.id),
      ["B"],
    );
    assert.deepEqual(
      childrenOf.get("B")?.map((t) => t.id),
      ["C"],
    );
    assert.deepEqual(orphans, []);
  });
  it("a blocker outside the view leaves the task an orphan, not lost", () => {
    const b = { id: "B", blocker: ref("elsewhere") };
    const { childrenOf, orphans } = nestBlocked([b]);
    assert.equal(childrenOf.size, 0);
    assert.deepEqual(
      orphans.map((t) => t.id),
      ["B"],
    );
  });
  it("a released task (blocker completed) is not nested", () => {
    const a = { id: "A", blocker: null };
    const b = { id: "B", blocker: ref("A", "completed") };
    const { childrenOf, orphans } = nestBlocked([a, b]);
    assert.equal(childrenOf.size, 0);
    assert.deepEqual(orphans, []);
  });
});
