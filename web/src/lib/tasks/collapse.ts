import type { Task } from "@/lib/types";

/**
 * Collapse a recurring series to a single row.
 *
 * WHY THIS EXISTS
 *
 * The spawner materializes occurrences two weeks ahead (#468), and the tasks list rendered every
 * one of them as its own row. Five "Water the plants" rows read as five chores rather than one
 * recurring chore, which buried the actual to-do list and made the recurrence itself invisible —
 * the repeat was expressed as duplication instead of as a property of one task.
 *
 * Worse, it made the verbs ambiguous. Archiving an occurrence skips that date and the series
 * carries on, but with the whole window on screen "archive them all" looked like a way to stop the
 * chore. It isn't; the next window just repopulates.
 *
 * So the list shows exactly ONE row per series: the oldest occurrence still to be done. Complete it
 * and the next takes its place. This is a rendering decision only — the underlying occurrences,
 * their history, `ends_on` and the expiry warning (#689) are untouched.
 */
export interface CollapsedTask extends Task {
  /**
   * Other occurrences of this series that were already due and never done. The visible row IS the
   * oldest of them, so this counts the ones behind it — 0 when you are on top of the chore.
   */
  missedCount: number;
  /** Total active occurrences of this series, visible row included. 0 for a one-off task. */
  seriesActiveCount: number;
}

/**
 * Reduce a flat list of active tasks so each series appears once.
 *
 * `today` is a local YYYY-MM-DD — pass `todayString()` rather than deriving from UTC, or a chore
 * due today reads as tomorrow's for anyone west of Greenwich.
 */
export function collapseSeriesOccurrences(tasks: Task[], today: string): CollapsedTask[] {
  const bySeries = new Map<string, Task[]>();
  const out: CollapsedTask[] = [];

  for (const t of tasks) {
    // A detached occurrence (#468's "this occurrence only" edit) clears series_id, so it correctly
    // falls through here and keeps its own row — that is the point of detaching.
    if (!t.series_id) {
      out.push({ ...t, missedCount: 0, seriesActiveCount: 0 });
      continue;
    }
    const arr = bySeries.get(t.series_id) ?? [];
    arr.push(t);
    bySeries.set(t.series_id, arr);
  }

  for (const group of bySeries.values()) {
    // Oldest first. `occurrence_date` is the series calendar's own key, not `due_date`, which the
    // user may have edited on a single row.
    const sorted = [...group].sort((a, b) =>
      (a.occurrence_date ?? "").localeCompare(b.occurrence_date ?? ""),
    );
    const visible = sorted[0];
    // Count only occurrences that were actually DUE — future ones are not "missed", they simply
    // haven't come round yet, and badging them would make every series look permanently behind.
    const due = sorted.filter((t) => (t.occurrence_date ?? "") <= today);
    out.push({
      ...visible,
      missedCount: Math.max(0, due.length - 1),
      seriesActiveCount: sorted.length,
    });
  }

  return out;
}
