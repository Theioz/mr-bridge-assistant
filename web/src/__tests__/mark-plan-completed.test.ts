// Unit tests for markPlanCompleted — the single place that flips workout_plans.status to
// 'completed' when a session is logged.
//
// WHY THIS EXISTS (#666)
//
// Nothing in the app ever set workout_plans.status off 'planned'. Logging the workout left the
// plan 'planned', and coach_check.py reads a past 'planned' row as a MISS — so on 2026-08-10, 11
// past plans were stale, 9 of them sessions actually completed, and the coaching loop saw
// near-total failure during a consistent training block.
//
// The failure is invisible to a type check: the update is well-formed, it just never ran. These
// tests pin the behaviour that matters — the flip is scoped to the right plan AND user, it is
// guarded so it cannot un-complete or churn, and a DB error is returned (never swallowed).

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { markPlanCompleted } from "../lib/fitness/mark-plan-completed.ts";

type Filter = [op: string, column: string, value: unknown];

interface Recorder {
  table?: string;
  updatePayload?: Record<string, unknown>;
  filters: Filter[];
  updateCalled: boolean;
}

/** Minimal Supabase stub that records the update chain and resolves to a fixed result. */
function fakeClient(result: { error: { message: string } | null }) {
  const rec: Recorder = { filters: [], updateCalled: false };

  const builder = {
    eq(column: string, value: unknown) {
      rec.filters.push(["eq", column, value]);
      return builder;
    },
    neq(column: string, value: unknown) {
      rec.filters.push(["neq", column, value]);
      return builder;
    },
    // Thenable: awaiting the terminal filter resolves to the Supabase-shaped result.
    then(resolve: (v: { error: unknown }) => void) {
      resolve({ error: result.error });
    },
  };

  const client = {
    from(table: string) {
      rec.table = table;
      return {
        update(payload: Record<string, unknown>) {
          rec.updateCalled = true;
          rec.updatePayload = payload;
          return builder;
        },
      };
    },
  };

  // The helper only needs .from().update().eq().neq(); the cast keeps it honest at the call site.
  return { client: client as unknown as Parameters<typeof markPlanCompleted>[0], rec };
}

describe("markPlanCompleted", () => {
  it("no-ops (no DB call) when planId is null or undefined", async () => {
    for (const planId of [null, undefined]) {
      const { client, rec } = fakeClient({ error: null });
      const err = await markPlanCompleted(client, "user-1", planId);
      assert.equal(err, null);
      assert.equal(rec.updateCalled, false, "must not issue an update without a plan id");
    }
  });

  it("flips status to completed, scoped to plan id AND user, guarded against re-completing", async () => {
    const { client, rec } = fakeClient({ error: null });
    const err = await markPlanCompleted(client, "user-1", "plan-42");

    assert.equal(err, null);
    assert.equal(rec.table, "workout_plans");
    assert.equal(rec.updatePayload?.status, "completed");
    assert.ok(rec.updatePayload?.updated_at, "should stamp updated_at");

    // Both scoping filters must be present — a flip missing the user scope would touch other
    // users' rows; missing the id would touch every plan.
    assert.deepEqual(
      rec.filters.filter((f) => f[0] === "eq"),
      [
        ["eq", "id", "plan-42"],
        ["eq", "user_id", "user-1"],
      ],
    );

    // The neq guard is what makes repeat calls (every set in a workout) a 0-row no-op instead of
    // a rewrite, and stops a completed plan from being needlessly re-touched.
    assert.deepEqual(
      rec.filters.filter((f) => f[0] === "neq"),
      [["neq", "status", "completed"]],
    );
  });

  it("returns the error message rather than throwing or swallowing it", async () => {
    const { client } = fakeClient({ error: { message: "rls denied" } });
    const err = await markPlanCompleted(client, "user-1", "plan-42");
    assert.equal(err, "rls denied");
  });
});
