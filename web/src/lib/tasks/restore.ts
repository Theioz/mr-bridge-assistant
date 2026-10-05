/**
 * Restore a completed task to active (#684). Shared by the /tasks server action and the
 * `restore_task` MCP tool so the two cannot drift.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export interface RestoreResult {
  ok: boolean;
  error?: string;
  task?: { id: string; title: string };
  /** Subtasks re-activated along with the parent. */
  subtasksRestored?: number;
}

export async function restoreTask({
  supabase,
  userId,
  taskId,
}: {
  supabase: SupabaseClient;
  userId: string;
  taskId: string;
}): Promise<RestoreResult> {
  const { data: task, error: readError } = await supabase
    .from("tasks")
    .select("id, title, status, completed_at, parent_id")
    .eq("id", taskId)
    .eq("user_id", userId)
    .maybeSingle();
  if (readError) return { ok: false, error: readError.message };
  if (!task) return { ok: false, error: `No task found with id ${taskId}.` };
  if (task.status !== "completed")
    return { ok: false, error: `Task is ${task.status}, not completed — nothing to restore.` };

  // completed_at must be cleared here: trg_tasks_completed_at only SETS it, on the transition into
  // 'completed'. Left alone, a restored task would carry a stale completion time, and the purge
  // ages tasks by it.
  const { data: restored, error: updateError } = await supabase
    .from("tasks")
    .update({ status: "active", completed_at: null })
    .eq("id", taskId)
    .eq("user_id", userId)
    .eq("status", "completed")
    .select("id, title")
    .maybeSingle();
  if (updateError) return { ok: false, error: updateError.message };
  if (!restored) return { ok: false, error: "Task changed before it could be restored." };

  // Completing a parent on /tasks also completes its open subtasks, in a second statement that
  // runs after the parent's (so their completed_at is >= the parent's). Those are the ones the
  // completion swept up, and undoing it should bring them back. A subtask finished earlier, on its
  // own, has an older completed_at and stays done — there is no way to un-tick one in the UI, so
  // re-opening it would be a change the user cannot reverse.
  let subtasksRestored = 0;
  if (!task.parent_id && task.completed_at) {
    const { data: subs, error: subError } = await supabase
      .from("tasks")
      .update({ status: "active", completed_at: null })
      .eq("parent_id", taskId)
      .eq("user_id", userId)
      .eq("status", "completed")
      .gte("completed_at", task.completed_at)
      .select("id");
    if (subError)
      return { ok: false, error: `Task restored, but its subtasks were not: ${subError.message}` };
    subtasksRestored = subs?.length ?? 0;
  }

  return { ok: true, task: restored, subtasksRestored };
}
