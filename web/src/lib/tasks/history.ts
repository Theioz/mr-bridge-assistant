// Completed-task history grouping (#684). Pure, so the day boundaries are unit-tested.
//
// The day a task was completed is read in the USER's timezone, passed in explicitly. The list is
// rendered on the server and hydrated in the browser; formatting with the runtime's own zone would
// put a 10 PM completion under different days in the two, and the server is in UTC.

export interface CompletedDayGroup<T> {
  /** YYYY-MM-DD in the user's timezone. */
  day: string;
  /** "Today", "Yesterday", or e.g. "Wed, Sep 10". */
  label: string;
  tasks: T[];
}

function previousDay(day: string): string {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

/**
 * Group tasks by the local day they were completed, newest day first, preserving the input order
 * within a day. Tasks with no completed_at are left out — there is no day to file them under.
 */
export function groupCompletedByDay<T extends { completed_at: string | null }>(
  tasks: T[],
  timeZone: string,
  today: string,
): CompletedDayGroup<T>[] {
  const dayOf = new Intl.DateTimeFormat("en-CA", { timeZone });
  const label = new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    weekday: "short",
    month: "short",
    day: "numeric",
  });
  const yesterday = previousDay(today);

  const groups = new Map<string, T[]>();
  for (const t of tasks) {
    if (!t.completed_at) continue;
    const day = dayOf.format(new Date(t.completed_at));
    const list = groups.get(day);
    if (list) list.push(t);
    else groups.set(day, [t]);
  }

  return [...groups.entries()]
    .sort(([a], [b]) => (a < b ? 1 : a > b ? -1 : 0))
    .map(([day, list]) => ({
      day,
      label:
        day === today
          ? "Today"
          : day === yesterday
            ? "Yesterday"
            : label.format(new Date(`${day}T12:00:00Z`)),
      tasks: list,
    }));
}
