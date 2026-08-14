import type { SupabaseClient } from "@supabase/supabase-js";

// WHY THIS EXISTS (#666)
//
// Nothing in the app ever moved `workout_plans.status` off `'planned'`. A plan row was created
// as `planned` and stayed that way forever — logging the workout did not change it. Only
// cancel/reschedule wrote status, and only to `'cancelled'`.
//
// `scripts/coach_check.py` escalates off consecutive missed *planned* days (2 misses drops
// volume, 3 concludes the program is wrong). A stale `planned` row in the past is
// indistinguishable from a miss, so on 2026-08-10 an audit found 11 past plans still `planned`,
// **9 of them sessions actually completed** — the coaching loop was reading near-total failure
// during a consistent training block. This is the same open-loop defect that killed coaching
// attempt #1, arriving through the status column.
//
// The fix is to flip the plan to `completed` the moment its session is written. That happens on
// two paths — logging a set (`POST`) and saving the end-of-workout recap (`PATCH`) — and the
// recap is optional, so both must call this or a sets-only workout stays `planned`. This helper
// is the single place that flip lives.

/**
 * Flip a workout plan to `completed` because its session was logged.
 *
 * Idempotent: the `.neq('status', 'completed')` guard makes a repeat call (e.g. every set in a
 * 13-set workout) a 0-row no-op rather than a needless rewrite. Overrides `cancelled`/`skipped`
 * as well — a logged session is ground truth that the workout was done.
 *
 * Non-fatal by contract: the caller's primary write (the set, or the recap) has already
 * succeeded before this runs. A failure here is returned, not thrown, so the caller can surface
 * it in the response without failing the whole request — but it is never swallowed silently,
 * which is the exact failure mode #666 is about.
 *
 * @returns an error message if the update failed, otherwise `null`.
 */
export async function markPlanCompleted(
  supabase: SupabaseClient,
  userId: string,
  planId: string | null | undefined,
): Promise<string | null> {
  if (!planId) return null;

  const { error } = await supabase
    .from("workout_plans")
    .update({ status: "completed", updated_at: new Date().toISOString() })
    .eq("id", planId)
    .eq("user_id", userId)
    .neq("status", "completed");

  return error?.message ?? null;
}
