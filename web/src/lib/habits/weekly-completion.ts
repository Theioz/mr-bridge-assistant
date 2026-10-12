// The one weekly habit-completion calculation, shared by /habits (Weekly Completion ring) and
// /weekly (Weekly Review → Habits panel).
//
// WHY THIS EXISTS
//
// On 2026-10-12 the two pages disagreed about the same seven days: /habits said 3/28 and
// /weekly said 0/28 · 0%. Each page carried its own copy of this arithmetic, and the copies had
// already drifted: /habits counted log ROWS, /weekly counted distinct (habit, day) pairs, and
// each page built its own date window. Nothing kept them answering the same question. Both now
// call `weeklyCompletion` with the same `days` list, so they cannot disagree about the maths.
//
// Rules:
//   - A hit is a distinct (habit, day) pair with `completed = true`. A duplicate row for the
//     same habit and day is one hit, not two.
//   - Only the habits passed in count (the active registry). A completed log for an archived
//     habit is history, not part of this week's denominator or numerator.
//   - Only days in `days` count. `days` is a list of YYYY-MM-DD strings in the user's timezone
//     (getLast7Days()), never derived from a UTC instant.
//   - pct = round(completed / possible × 100). 0 possible → 0 %.

export interface HabitLogLike {
  habit_id: string;
  date: string;
  completed?: boolean | null;
}

export interface HabitCompletion {
  habitId: string;
  /** The days in the window this habit was completed, as YYYY-MM-DD. */
  dates: Set<string>;
  /** dates.size — kept as a number for sorting and display. */
  days: number;
}

export interface WeeklyCompletion {
  perHabit: HabitCompletion[];
  completed: number;
  possible: number;
  pct: number;
}

export function completionPct(completed: number, possible: number): number {
  if (possible <= 0) return 0;
  return Math.round((completed / possible) * 100);
}

/**
 * @param habitIds  Active habit ids, in the order the caller wants `perHabit` returned.
 * @param logs      Habit log rows. A row that omits `completed` counts as completed (callers
 *                  that pre-filter on `completed = true` may leave the column out); an explicit
 *                  false or null does not.
 * @param days      The window, as YYYY-MM-DD strings in the user's timezone.
 */
export function weeklyCompletion(
  habitIds: string[],
  logs: HabitLogLike[],
  days: string[],
): WeeklyCompletion {
  const window = new Set(days);
  const active = new Set(habitIds);
  const byHabit = new Map<string, Set<string>>();
  for (const id of habitIds) byHabit.set(id, new Set());

  for (const log of logs) {
    if (log.completed === false || log.completed === null) continue;
    if (!active.has(log.habit_id) || !window.has(log.date)) continue;
    byHabit.get(log.habit_id)!.add(log.date);
  }

  const perHabit = habitIds.map((habitId) => {
    const dates = byHabit.get(habitId)!;
    return { habitId, dates, days: dates.size };
  });
  const completed = perHabit.reduce((s, h) => s + h.days, 0);
  const possible = habitIds.length * window.size;
  return { perHabit, completed, possible, pct: completionPct(completed, possible) };
}
