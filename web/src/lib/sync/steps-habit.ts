import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Steps → "10,000 Steps" habit, completed by the Oura sync rather than by hand.
 *
 * The ring already knows the step count, so asking the user to tick the habit as well is a second
 * entry of the same fact — and the one that gets skipped. This only ever COMPLETES the habit: a
 * low-step day is left alone (the user may have walked without the ring, or will log it), an
 * existing row's notes are never touched, and a day already marked done is not rewritten.
 *
 * No `@/` imports, so node's bundler-free test runner loads it directly.
 */

export const STEPS_HABIT_NAME = "10,000 Steps";
export const DEFAULT_STEPS_GOAL = 10000;

/** Parse profile.steps_goal; anything unset or non-positive falls back to the default. */
export function stepsGoalFrom(raw: string | null | undefined): number {
  const n = Number(raw);
  return raw != null && raw.trim() !== "" && Number.isFinite(n) && n > 0 ? n : DEFAULT_STEPS_GOAL;
}

/**
 * The dates whose step count met the goal, sorted and de-duplicated. A null count (no activity
 * data that day) never qualifies.
 */
export function datesMeetingStepsGoal(
  rows: { date: string; steps: number | null | undefined }[],
  goal: number,
): string[] {
  const hit = new Set<string>();
  for (const r of rows) if (r.steps != null && r.steps >= goal) hit.add(r.date);
  return [...hit].sort();
}

/**
 * Mark the steps habit completed for each qualifying date. Read-then-write so an existing row is
 * only flipped to completed (notes preserved) and a missing one is inserted; a habit the user does
 * not have is skipped silently. Returns the dates written.
 */
export async function autoCompleteStepsHabit(
  db: SupabaseClient,
  userId: string,
  rows: { date: string; steps: number | null | undefined }[],
): Promise<string[]> {
  const { data: goalRow } = await db
    .from("profile")
    .select("value")
    .eq("user_id", userId)
    .eq("key", "steps_goal")
    .maybeSingle();
  const dates = datesMeetingStepsGoal(rows, stepsGoalFrom(goalRow?.value as string | undefined));
  if (dates.length === 0) return [];

  const { data: habit, error: habitErr } = await db
    .from("habit_registry")
    .select("id")
    .eq("user_id", userId)
    .ilike("name", STEPS_HABIT_NAME)
    .eq("active", true)
    .limit(1)
    .maybeSingle();
  if (habitErr) throw new Error(`steps habit lookup failed: ${habitErr.message}`);
  if (!habit) return [];

  const { data: existing, error: readErr } = await db
    .from("habits")
    .select("date, completed")
    .eq("user_id", userId)
    .eq("habit_id", habit.id)
    .in("date", dates);
  if (readErr) throw new Error(`steps habit read failed: ${readErr.message}`);
  const byDate = new Map(
    ((existing ?? []) as { date: string; completed: boolean }[]).map((r) => [r.date, r.completed]),
  );

  const toInsert = dates.filter((d) => !byDate.has(d));
  const toComplete = dates.filter((d) => byDate.get(d) === false);

  if (toInsert.length) {
    const { error } = await db
      .from("habits")
      .insert(
        toInsert.map((date) => ({ user_id: userId, habit_id: habit.id, date, completed: true })),
      );
    if (error) throw new Error(`steps habit insert failed: ${error.message}`);
  }
  if (toComplete.length) {
    // Only `completed` is patched — the row's notes are the user's.
    const { error } = await db
      .from("habits")
      .update({ completed: true })
      .eq("user_id", userId)
      .eq("habit_id", habit.id)
      .in("date", toComplete);
    if (error) throw new Error(`steps habit update failed: ${error.message}`);
  }
  return [...toInsert, ...toComplete].sort();
}
