// Task dependencies, single blocker (#470). The rules the database enforces live in migration
// 20261005120000_task_blockers.sql; this is the read side.
//
// A task is BLOCKED while its blocker is ACTIVE. A completed blocker releases it, and so does an
// archived one: archive means dropped, and a task hidden behind a dropped task would stay hidden
// with nothing on screen saying why.

/** PostgREST embed of the blocking task. Name the FK: tasks has more than one self-reference. */
export const BLOCKER_EMBED = "blocker:tasks!tasks_blocked_by_fkey(id, title, status)";

export interface BlockerRef {
  id: string;
  title: string;
  status: string;
}

export function isBlocked(task: { blocker?: BlockerRef | null }): boolean {
  return task.blocker?.status === "active";
}

/** Split tasks into the ones you can act on now and the ones waiting on another task. */
export function partitionBlocked<T extends { blocker?: BlockerRef | null }>(
  tasks: T[],
): { ready: T[]; blocked: T[] } {
  const ready: T[] = [];
  const blocked: T[] = [];
  for (const t of tasks) (isBlocked(t) ? blocked : ready).push(t);
  return { ready, blocked };
}
