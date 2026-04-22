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
import type { Task } from "@/lib/types";

async function addTask(
  title: string,
  priority: string,
  dueDate: string,
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
    const { error } = await supabase
      .from("tasks")
      .update({ status: "completed", completed_at: new Date().toISOString() })
      .eq("id", taskId);
    if (error) return { error: error.message };
    // Also complete any active subtasks
    await supabase
      .from("tasks")
      .update({ status: "completed", completed_at: new Date().toISOString() })
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
  fields: { title?: string; due_date?: string | null; priority?: string | null },
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
    const { error } = await supabase
      .from("tasks")
      .update({ status: "completed", completed_at: new Date().toISOString() })
      .eq("id", id);
    if (error) return { error: error.message };
    // Check if all siblings are now completed — if so, complete parent
    if (subtask?.parent_id) {
      const { data: siblings } = await supabase
        .from("tasks")
        .select("status")
        .eq("parent_id", subtask.parent_id);
      const allDone = (siblings ?? []).every((s) => s.status === "completed");
      if (allDone) {
        await supabase
          .from("tasks")
          .update({ status: "completed", completed_at: new Date().toISOString() })
          .eq("id", subtask.parent_id);
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

const priorityOrder = { high: 0, medium: 1, low: 2 };

export default async function TasksPage() {
  const supabase = await createClient();

  const [activeResult, completedResult, subtasksResult] = await Promise.all([
    supabase
      .from("tasks")
      .select("*")
      .is("parent_id", null)
      .eq("status", "active")
      .order("created_at", { ascending: false }),
    supabase
      .from("tasks")
      .select("*")
      .is("parent_id", null)
      .eq("status", "completed")
      .order("completed_at", { ascending: false })
      .limit(10),
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

      {/* Always-visible add form — inline, hairline bottom rule, transparent */}
      <AddTaskForm addAction={addTask} />

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
                        completeAction={completeTask}
                        archiveAction={archiveTask}
                        updateAction={updateTask}
                        addSubtaskAction={addSubtask}
                        completeSubtaskAction={completeSubtask}
                        deleteSubtaskAction={deleteSubtask}
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
          No tasks. Add one above.
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
