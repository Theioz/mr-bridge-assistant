// Workout dedup — THE single implementation.
//
// Deliberately a LEAF MODULE with zero imports. Two reasons:
//
//  1. It can be unit-tested on Node's built-in runner with no dependencies and no module
//     aliasing (see web/src/__tests__/google-health-dedupe.test.ts). Importing it from
//     google-health.ts instead would drag in the Supabase client and `@/`-aliased modules,
//     which the bare `node --experimental-strip-types --test` resolver cannot load.
//  2. Until 2026-08-05 this rule existed TWICE — once here in TypeScript and once in
//     scripts/sync-google-health.py. They drifted and both carried the same bug; fixing
//     the Python copy (#656) read as fixing the system while the nightly cron, which runs
//     the TypeScript path, kept writing duplicates until #657. The Python syncs were then
//     deleted and this became the only implementation. Keep it that way: if dedup needs
//     changing, it changes HERE, once.

/** A workout row already stored in `workout_sessions`. */
export interface StoredWorkout {
  id: string;
  date: string;
  start_time: string | null;
  activity: string;
  avg_hr: number | null;
  duration_mins: number | null;
}

/** ±5 min. Two starts closer together than this on one date are the same session. */
export const OVERLAP_MINS = 5;

/** "13:12:00" → minutes past midnight. Null for a missing or unparseable time. */
export function timeToMins(t: string | null): number | null {
  if (!t) return null;
  const [h, m] = t.split(":").map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  return h * 60 + m;
}

/**
 * Decide which incoming workouts are genuinely new.
 *
 * Exact-key dedup (`date|start_time|activity`), then a ±5 min same-date overlap check.
 * An overlapping row is never replaced: the stored row is the same workout already held
 * under an older source label, so swapping it would churn history for no gain.
 *
 * The window is checked against stored rows AND against rows already accepted earlier in
 * this same batch. Google Health aggregates several writers (watch, phone, connected
 * apps) and commonly emits one activity twice per response — once from the writer holding
 * the HR sensor, with `hr_zones` populated, and once as a coarse copy with `hr_zones` null
 * and a wild calorie figure. Both arrive together, so neither is stored yet when the other
 * is judged, and a plain `.filter()` over the stored rows lets both through. That was the
 * bug behind the 2026-07-31 duplicates. The next run does suppress further copies, which
 * is why they sat as stable pairs rather than multiplying, and why it went unnoticed.
 */
export function filterNewWorkouts(
  stored: StoredWorkout[],
  incoming: Record<string, unknown>[],
): Record<string, unknown>[] {
  const storedKeys = new Set(stored.map((r) => `${r.date}|${r.start_time}|${r.activity}`));
  const exactNew = incoming.filter((r) => !storedKeys.has(r._key as string));

  const dateIndex = new Map<string, StoredWorkout[]>();
  for (const r of stored) dateIndex.set(r.date, [...(dateIndex.get(r.date) ?? []), r]);

  const accepted: Record<string, unknown>[] = [];
  for (const row of exactNew) {
    const newMins = timeToMins(row.start_time as string | null);
    const date = row.date as string;
    let overlapped = false;
    for (const ex of dateIndex.get(date) ?? []) {
      const exMins = timeToMins(ex.start_time);
      if (newMins == null || exMins == null) continue;
      if (Math.abs(newMins - exMins) <= OVERLAP_MINS) {
        overlapped = true;
        break;
      }
    }
    if (overlapped) continue;
    accepted.push(row);
    // The accepted row joins the comparison set for the rest of this batch.
    dateIndex.set(date, [
      ...(dateIndex.get(date) ?? []),
      {
        id: "",
        date,
        start_time: row.start_time as string | null,
        activity: row.activity as string,
        avg_hr: null,
        duration_mins: null,
      },
    ]);
  }
  return accepted;
}
