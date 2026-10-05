// Completed-task retention (#684).
//
// Completed tasks are kept for COMPLETED_RETENTION_DAYS, browsable and restorable in that window,
// then hard-deleted by scripts/purge_completed_tasks.py. The Python side mirrors this constant in
// scripts/_retention.py — change both together.
//
// THE SPAWN FLOOR IS THE OTHER HALF OF THE PURGE
//
// Both occurrence spawners skip a date only because a row for it already exists, completed or not.
// `spawnOccurrences` (lib/tasks/series.ts) recomputes from the series' starts_on on every create
// and extend. Once the purge deletes an old completed occurrence, that date has no row, and the
// next extend would recreate it as an active, overdue chore — every purged week of a weekly series
// back on the list at once. So the purge only takes an occurrence whose occurrence_date is also
// past the window, and neither spawner materializes a date before `retentionFloor()`. A purged
// date is therefore always one no spawner will look at again.

export const COMPLETED_RETENTION_DAYS = 90;

/** YYYY-MM-DD, local calendar date, `COMPLETED_RETENTION_DAYS` before `now`. */
export function retentionFloor(now: Date = new Date()): string {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - COMPLETED_RETENTION_DAYS);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** ISO timestamp `COMPLETED_RETENTION_DAYS` before `now` — the oldest completed_at still kept. */
export function retentionCutoff(now: Date = new Date()): string {
  return new Date(now.getTime() - COMPLETED_RETENTION_DAYS * 86_400_000).toISOString();
}
