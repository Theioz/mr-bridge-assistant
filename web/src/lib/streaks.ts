export interface StreakData {
  current: number;
  best: number;
}

export type HabitStreaks = Record<string, StreakData>;

/** Convert YYYY-MM-DD to integer day number (days since Unix epoch at noon UTC, DST-safe) */
function dateToDayNum(dateStr: string): number {
  return Math.floor(new Date(dateStr + "T12:00:00Z").getTime() / 86400000);
}

/**
 * Compute current and all-time best streak per habit.
 *
 * @param completedLogs  All habit logs where completed=true (all time, no date filter).
 * @param today          Today's date as YYYY-MM-DD.
 *
 * Current streak logic:
 *   - If today is completed: count from today backwards through consecutive completed days.
 *   - If today is not completed: count from yesterday backwards (streak still alive until EOD).
 *   - If neither today nor yesterday is completed: current = 0.
 */
export function computeStreaks(
  completedLogs: { habit_id: string; date: string }[],
  today: string,
): HabitStreaks {
  const byHabit = new Map<string, Set<number>>();
  for (const log of completedLogs) {
    if (!byHabit.has(log.habit_id)) byHabit.set(log.habit_id, new Set());
    byHabit.get(log.habit_id)!.add(dateToDayNum(log.date));
  }

  const todayNum = dateToDayNum(today);
  const result: HabitStreaks = {};

  for (const [habitId, dayNums] of byHabit) {
    const sorted = Array.from(dayNums).sort((a, b) => a - b);

    // Best streak: longest consecutive run in all-time data
    let best = sorted.length > 0 ? 1 : 0;
    let run = 1;
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i] === sorted[i - 1] + 1) {
        run++;
        if (run > best) best = run;
      } else {
        run = 1;
      }
    }

    // Current streak: walk backwards from today (or yesterday if today not done)
    let current = 0;
    let checkDay = dayNums.has(todayNum) ? todayNum : todayNum - 1;
    while (dayNums.has(checkDay)) {
      current++;
      checkDay--;
    }

    result[habitId] = { current, best };
  }

  return result;
}
