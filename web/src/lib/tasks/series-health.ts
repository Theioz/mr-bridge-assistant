// Is a live recurring series silent? (#703)
//
// Mirrors scripts/_series_health.py — change both together. The cases are pinned in
// src/__tests__/series-health.test.ts and tests/test_series_health.py.
//
// A series is SILENT when its rule says the chore should be on the list right now and it is not:
//   - the rule has at least one date in the spawn window [today, today + horizon],
//   - the series has no ACTIVE occurrence at any date (an overdue one is still on the list), and
//   - none of the in-window dates was COMPLETED (done early is "on top of it", not silent).
// That leaves every in-window date archived ("skip"), or never created at all. Both look like a
// healthy series: no row, no error, "created 0" in the spawner's log.
//
// Deliberately NOT silent: a monthly chore whose next date is beyond the window. Nothing is due,
// so nothing is missing.

/** How far ahead the spawners materialize occurrences. Mirrors HORIZON_DAYS in the Python spawner. */
export const SPAWN_HORIZON_DAYS = 14;

export interface OccurrenceRow {
  status: string;
  occurrence_date: string | null;
}

/**
 * @param ruleDatesInWindow the series' rule dates in [today, today + horizon], YYYY-MM-DD
 * @param rows this series' active rows (any date) and completed rows; archived rows are ignored
 */
export function isSilent(ruleDatesInWindow: string[], rows: OccurrenceRow[]): boolean {
  if (!ruleDatesInWindow.length) return false;
  if (rows.some((r) => r.status === "active")) return false;
  const window = new Set(ruleDatesInWindow);
  return !rows.some(
    (r) => r.status === "completed" && r.occurrence_date !== null && window.has(r.occurrence_date),
  );
}
