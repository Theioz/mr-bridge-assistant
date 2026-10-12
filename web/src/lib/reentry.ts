// When did Jason last log something BY HAND, and has it been quiet long enough that the app
// should greet him with a forward-only "start from today" instead of its usual sections?
//
// WHY THIS EXISTS
//
// The GA review (#761) found that every hand-entered log stopped on the same day while the
// Oura and Google Health syncs carried on. A dashboard full of synced numbers reads as "all
// fine" while nothing he does himself is being recorded, and the obvious repair — "you missed
// N days, want to fill them in?" — is the one he has explicitly rejected:
//
//   "I don't want to go looking back. I want today to be our reset and only looking forward."
//
// So the signal is computed here, and its consumers (the dashboard card and the
// get_logging_status MCP tool) only ever use it to point FORWARD. It deliberately carries no
// list of missing days: what isn't computed can't be turned into a backfill prompt.
//
// "Hand-entered" = the tables only a person writes: meal_log, habits, strength_sessions,
// journal_entries. Synced tables (recovery_metrics, fitness_log, workout_sessions) are excluded
// on purpose — they keep filling in while he is away, which is the whole problem.
//
// Pure (no I/O, no Date.now()) so the edges are unit-tested; the query lives in
// reentry-query.ts.

/** Calendar days without a hand-entered log before the dashboard switches to re-entry. */
export const REENTRY_QUIET_DAYS = 3;

export interface ReentrySignal {
  /** Most recent YYYY-MM-DD with any hand-entered row, or null if there has never been one. */
  lastHandLoggedOn: string | null;
  /** Calendar days from that date to today (0 = logged today). Null when never logged. */
  quietDays: number | null;
  /** True when quietDays >= REENTRY_QUIET_DAYS. */
  reentry: boolean;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function dayNumber(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  return Date.UTC(y, m - 1, d) / 86_400_000;
}

/**
 * The latest date among `dates` that is on or before `today`. Null/garbage entries are ignored,
 * and so are future dates — a row dated tomorrow (a timezone slip, a pre-filled journal) must not
 * make an empty week look active.
 */
export function latestLoggedDate(
  dates: ReadonlyArray<string | null | undefined>,
  today: string,
): string | null {
  let best: string | null = null;
  for (const raw of dates) {
    if (!raw) continue;
    const d = raw.slice(0, 10);
    if (!ISO_DATE.test(d) || d > today) continue;
    if (best === null || d > best) best = d;
  }
  return best;
}

/**
 * Build the signal from the newest date of each hand-entered table.
 *
 * Never-logged (a fresh install) is NOT re-entry: "Welcome back" to someone who has never been
 * here is wrong, and onboarding already covers that case.
 */
export function computeReentry(
  dates: ReadonlyArray<string | null | undefined>,
  today: string,
  threshold: number = REENTRY_QUIET_DAYS,
): ReentrySignal {
  const last = latestLoggedDate(dates, today);
  if (last === null) return { lastHandLoggedOn: null, quietDays: null, reentry: false };
  const quietDays = Math.max(0, Math.round(dayNumber(today) - dayNumber(last)));
  return { lastHandLoggedOn: last, quietDays, reentry: quietDays >= threshold };
}
