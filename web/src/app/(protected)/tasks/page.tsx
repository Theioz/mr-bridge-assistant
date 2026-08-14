export const dynamic = "force-dynamic";

import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import TaskItem from "@/components/tasks/task-item";

export const metadata: Metadata = {
  title: "Tasks",
  description: "Active tasks with priorities and due dates.",
};
import AddTaskForm from "@/components/tasks/add-task-form";
import CompletedTasks from "@/components/tasks/completed-tasks";
import ListTabs from "@/components/tasks/list-tabs";
import { scheduleTask, unscheduleTask } from "@/lib/tasks/schedule-task";
import type { Task, TaskList } from "@/lib/types";

async function addTask(
  title: string,
  priority: string,
  dueDate: string,
  listId: string,
): Promise<{ error?: string }> {
  "use server";
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { error: "Unauthorized" };
    const { error } = await supabase.from("tasks").insert({
      user_id: user.id,
      title,
      priority: priority || "medium",
      status: "active",
      due_date: dueDate || null,
      list_id: listId || null,
    });
    if (error) return { error: error.message };
    revalidatePath("/tasks");
    revalidatePath("/dashboard");
    return {};
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to add task" };
  }
}

async function completeTask(taskId: string): Promise<{ error?: string }> {
  "use server";
  try {
    const supabase = await createClient();
    const { error } = await supabase.from("tasks").update({ status: "completed" }).eq("id", taskId);
    if (error) return { error: error.message };
    // Also complete any active subtasks
    await supabase
      .from("tasks")
      .update({ status: "completed" })
      .eq("parent_id", taskId)
      .eq("status", "active");
    revalidatePath("/tasks");
    revalidatePath("/dashboard");
    return {};
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to complete task" };
  }
}

async function archiveTask(taskId: string): Promise<{ error?: string }> {
  "use server";
  try {
    const supabase = await createClient();
    const { error } = await supabase.from("tasks").update({ status: "archived" }).eq("id", taskId);
    if (error) return { error: error.message };
    revalidatePath("/tasks");
    revalidatePath("/dashboard");
    return {};
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to archive task" };
  }
}

async function updateTask(
  taskId: string,
  fields: {
    title?: string;
    due_date?: string | null;
    priority?: string | null;
    list_id?: string | null;
  },
): Promise<{ error?: string }> {
  "use server";
  try {
    const supabase = await createClient();
    const { error } = await supabase.from("tasks").update(fields).eq("id", taskId);
    if (error) return { error: error.message };
    revalidatePath("/tasks");
    revalidatePath("/dashboard");
    return {};
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to update task" };
  }
}

async function addSubtask(parentId: string, title: string): Promise<{ error?: string }> {
  "use server";
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { error: "Unauthorized" };
    const { error } = await supabase.from("tasks").insert({
      user_id: user.id,
      title,
      parent_id: parentId,
      status: "active",
      priority: null,
      due_date: null,
    });
    if (error) return { error: error.message };
    revalidatePath("/tasks");
    return {};
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to add subtask" };
  }
}

async function completeSubtask(id: string): Promise<{ error?: string }> {
  "use server";
  try {
    const supabase = await createClient();
    // Get parent_id before completing
    const { data: subtask } = await supabase
      .from("tasks")
      .select("parent_id")
      .eq("id", id)
      .single();
    const { error } = await supabase.from("tasks").update({ status: "completed" }).eq("id", id);
    if (error) return { error: error.message };
    // Check if all siblings are now completed — if so, complete parent
    if (subtask?.parent_id) {
      const { data: siblings } = await supabase
        .from("tasks")
        .select("status")
        .eq("parent_id", subtask.parent_id);
      const allDone = (siblings ?? []).every((s) => s.status === "completed");
      if (allDone) {
        await supabase.from("tasks").update({ status: "completed" }).eq("id", subtask.parent_id);
      }
    }
    revalidatePath("/tasks");
    revalidatePath("/dashboard");
    return {};
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to complete subtask" };
  }
}

async function deleteSubtask(id: string): Promise<{ error?: string }> {
  "use server";
  try {
    const supabase = await createClient();
    const { error } = await supabase.from("tasks").delete().eq("id", id);
    if (error) return { error: error.message };
    revalidatePath("/tasks");
    return {};
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to delete subtask" };
  }
}

async function createList(name: string): Promise<{ error?: string; id?: string }> {
  "use server";
  try {
    const trimmed = name.trim();
    if (!trimmed) return { error: "List name cannot be empty" };
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { error: "Unauthorized" };
    // A list is a folder — dedup case-insensitively so two "Groceries" can't exist.
    const { data: existing } = await supabase
      .from("task_lists")
      .select("id")
      .eq("user_id", user.id)
      .ilike("name", trimmed)
      .maybeSingle();
    if (existing) return { id: existing.id };
    const { data, error } = await supabase
      .from("task_lists")
      .insert({ user_id: user.id, name: trimmed })
      .select("id")
      .single();
    if (error) return { error: error.message };
    revalidatePath("/tasks");
    return { id: data?.id };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to create list" };
  }
}

async function renameList(id: string, name: string): Promise<{ error?: string }> {
  "use server";
  try {
    const trimmed = name.trim();
    if (!trimmed) return { error: "List name cannot be empty" };
    const supabase = await createClient();
    const { error } = await supabase.from("task_lists").update({ name: trimmed }).eq("id", id);
    if (error) return { error: error.message };
    revalidatePath("/tasks");
    return {};
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to rename list" };
  }
}

async function deleteList(id: string): Promise<{ error?: string }> {
  "use server";
  try {
    const supabase = await createClient();
    // FK is `on delete set null`, so a list's tasks survive as uncategorised.
    const { error } = await supabase.from("task_lists").delete().eq("id", id);
    if (error) return { error: error.message };
    revalidatePath("/tasks");
    revalidatePath("/dashboard");
    return {};
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to delete list" };
  }
}

async function scheduleTaskAction(
  taskId: string,
  startISO: string,
  endISO: string,
): Promise<{ error?: string; warning?: string }> {
  "use server";
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { error: "Unauthorized" };
    const res = await scheduleTask({ supabase, userId: user.id, taskId, startISO, endISO });
    if (!res.ok) return { error: res.error ?? "Failed to schedule" };
    revalidatePath("/tasks");
    revalidatePath("/dashboard");
    // The block saved even if Google didn't — surface that as a soft warning, not a failure.
    return res.calendar_synced
      ? {}
      : { warning: `Saved, but calendar didn't sync: ${res.calendar_error ?? "unknown"}` };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to schedule" };
  }
}

async function unscheduleTaskAction(taskId: string): Promise<{ error?: string; warning?: string }> {
  "use server";
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { error: "Unauthorized" };
    const res = await unscheduleTask({ supabase, userId: user.id, taskId });
    if (!res.ok) return { error: res.error ?? "Failed to remove from calendar" };
    revalidatePath("/tasks");
    revalidatePath("/dashboard");
    return res.calendar_synced
      ? {}
      : {
          warning: `Block cleared, but the calendar event may remain: ${res.calendar_error ?? "unknown"}`,
        };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to remove from calendar" };
  }
}

const priorityOrder = { high: 0, medium: 1, low: 2 };

export default async function TasksPage({
  searchParams,
}: {
  searchParams: Promise<{ list?: string }>;
}) {
  const supabase = await createClient();
  const selected = (await searchParams).list ?? "all"; // "all" | "none" | <listId>

  let activeQuery = supabase
    .from("tasks")
    .select("*")
    .is("parent_id", null)
    .eq("status", "active")
    .order("created_at", { ascending: false });
  let completedQuery = supabase
    .from("tasks")
    .select("*")
    .is("parent_id", null)
    .eq("status", "completed")
    .order("completed_at", { ascending: false })
    .limit(10);
  if (selected === "none") {
    activeQuery = activeQuery.is("list_id", null);
    completedQuery = completedQuery.is("list_id", null);
  } else if (selected !== "all") {
    activeQuery = activeQuery.eq("list_id", selected);
    completedQuery = completedQuery.eq("list_id", selected);
  }

  const [listsResult, countRowsResult, activeResult, completedResult, subtasksResult] =
    await Promise.all([
      supabase
        .from("task_lists")
        .select("id, name, color, sort_order")
        .order("sort_order", { ascending: true })
        .order("name", { ascending: true }),
      // Only list_id, across all lists — used to badge each tab with its active count.
      supabase.from("tasks").select("list_id").is("parent_id", null).eq("status", "active"),
      activeQuery,
      completedQuery,
      supabase
        .from("tasks")
        .select("id, title, status, created_at, parent_id")
        .not("parent_id", "is", null)
        .eq("status", "active"),
    ]);

  if (activeResult.error) console.error("[tasks] active query error:", activeResult.error.message);
  if (completedResult.error)
    console.error("[tasks] completed query error:", completedResult.error.message);
  if (subtasksResult.error)
    console.error("[tasks] subtasks query error:", subtasksResult.error.message);
  if (listsResult.error) console.error("[tasks] lists query error:", listsResult.error.message);

  const lists = (listsResult.data ?? []) as TaskList[];

  // Per-tab active counts. "none" = uncategorised; totals feed the "All" tab.
  const counts: Record<string, number> = { all: 0, none: 0 };
  for (const row of (countRowsResult.data ?? []) as { list_id: string | null }[]) {
    counts.all += 1;
    const key = row.list_id ?? "none";
    counts[key] = (counts[key] ?? 0) + 1;
  }

  const subtasksByParent = new Map<string, Task[]>();
  for (const s of (subtasksResult.data ?? []) as Task[]) {
    if (!s.parent_id) continue;
    const arr = subtasksByParent.get(s.parent_id) ?? [];
    arr.push(s);
    subtasksByParent.set(s.parent_id, arr);
  }

  const tasks = ((activeResult.data ?? []) as Task[])
    .map((t) => ({ ...t, subtasks: subtasksByParent.get(t.id) ?? [] }))
    .sort(
      (a, b) =>
        (priorityOrder[a.priority ?? "low"] ?? 2) - (priorityOrder[b.priority ?? "low"] ?? 2),
    );
  const completedTasks = (completedResult.data ?? []) as Task[];

  const high = tasks.filter((t) => t.priority === "high");
  const medium = tasks.filter((t) => t.priority === "medium");
  const low = tasks.filter((t) => t.priority === "low" || !t.priority);

  // New tasks default into the list you're viewing ("all"/"none" → uncategorised).
  const defaultListId = selected === "all" || selected === "none" ? "" : selected;

  return (
    <div className="max-w-2xl">
      {/* Header */}
      <div style={{ marginBottom: "var(--space-5)" }}>
        <h1
          className="font-heading font-semibold"
          style={{ fontSize: 24, color: "var(--color-text)" }}
        >
          Tasks
        </h1>
        <p
          className="mt-1"
          style={{ fontSize: "var(--t-micro)", color: "var(--color-text-muted)" }}
        >
          {tasks.length} active
          {completedTasks.length > 0 ? ` · ${completedTasks.length} recently completed` : ""}
        </p>
      </div>

      {/* List tabs — TickTick-style folders (All · lists · +) */}
      <ListTabs
        lists={lists}
        selected={selected}
        counts={counts}
        createAction={createList}
        renameAction={renameList}
        deleteAction={deleteList}
      />

      {/* Always-visible add form — inline, hairline bottom rule, transparent */}
      <AddTaskForm addAction={addTask} lists={lists} defaultListId={defaultListId} />

      {/* Priority groups — hairline-separated rows, no card shell */}
      {tasks.length > 0 && (
        <div>
          {[
            { label: "High", items: high },
            { label: "Medium", items: medium },
            { label: "Low", items: low },
          ].map(({ label, items }) =>
            items.length > 0 ? (
              <section
                key={label}
                style={{ paddingTop: "var(--space-6)", paddingBottom: "var(--space-2)" }}
              >
                <h2 className="db-section-label">
                  {label}
                  <span className="meta">· {items.length}</span>
                </h2>
                <div>
                  {items.map((task, i) => (
                    <div
                      key={task.id}
                      style={i > 0 ? { borderTop: "1px solid var(--rule-soft)" } : {}}
                    >
                      <TaskItem
                        task={task}
                        lists={lists}
                        completeAction={completeTask}
                        archiveAction={archiveTask}
                        updateAction={updateTask}
                        addSubtaskAction={addSubtask}
                        completeSubtaskAction={completeSubtask}
                        deleteSubtaskAction={deleteSubtask}
                        scheduleAction={scheduleTaskAction}
                        unscheduleAction={unscheduleTaskAction}
                      />
                    </div>
                  ))}
                </div>
              </section>
            ) : null,
          )}
        </div>
      )}

      {tasks.length === 0 && completedTasks.length === 0 && (
        <p
          style={{
            fontSize: "var(--t-body)",
            color: "var(--color-text-faint)",
            paddingTop: "var(--space-6)",
          }}
        >
          {selected === "all" ? "No tasks. Add one above." : "No tasks in this list yet."}
        </p>
      )}

      {/* Completed section — low-emphasis, faint, collapsed by default */}
      {completedTasks.length > 0 && (
        <div style={{ marginTop: "var(--space-7)" }}>
          <CompletedTasks tasks={completedTasks} />
        </div>
      )}
    </div>
  );
}
