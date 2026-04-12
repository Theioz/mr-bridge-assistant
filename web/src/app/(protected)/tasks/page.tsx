export const dynamic = "force-dynamic";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import TaskItem from "@/components/tasks/task-item";
import AddTaskForm from "@/components/tasks/add-task-form";
import CompletedTasks from "@/components/tasks/completed-tasks";
import type { Task } from "@/lib/types";

async function addTask(title: string, priority: string, dueDate: string): Promise<{ error?: string }> {
  "use server";
  try {
    const supabase = await createClient();
    const { error } = await supabase.from("tasks").insert({
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

async function updateTask(taskId: string, title: string): Promise<{ error?: string }> {
  "use server";
  try {
    const supabase = await createClient();
    const { error } = await supabase.from("tasks").update({ title }).eq("id", taskId);
    if (error) return { error: error.message };
    revalidatePath("/tasks");
    return {};
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to update task" };
  }
}

const priorityOrder = { high: 0, medium: 1, low: 2 };

export default async function TasksPage() {
  const supabase = await createClient();

  const [activeResult, completedResult] = await Promise.all([
    supabase.from("tasks").select("*").eq("status", "active").order("created_at", { ascending: false }),
    supabase
      .from("tasks")
      .select("*")
      .eq("status", "completed")
      .order("completed_at", { ascending: false })
      .limit(10),
  ]);

  const tasks = ((activeResult.data ?? []) as Task[]).sort(
    (a, b) =>
      (priorityOrder[a.priority ?? "low"] ?? 2) -
      (priorityOrder[b.priority ?? "low"] ?? 2)
  );
  const completedTasks = (completedResult.data ?? []) as Task[];

  const high   = tasks.filter((t) => t.priority === "high");
  const medium = tasks.filter((t) => t.priority === "medium");
  const low    = tasks.filter((t) => t.priority === "low" || !t.priority);

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Header */}
      <div>
        <h1 className="font-heading font-semibold" style={{ fontSize: 24, color: "var(--color-text)" }}>
          Tasks
        </h1>
        <p className="mt-1" style={{ fontSize: 14, color: "var(--color-text-muted)" }}>
          {tasks.length} active
          {completedTasks.length > 0 ? ` · ${completedTasks.length} recently completed` : ""}
        </p>
      </div>

      {/* Always-visible add form */}
      <AddTaskForm addAction={addTask} />

      {/* Priority groups */}
      {tasks.length > 0 && (
        <div className="space-y-5">
          {[
            { label: "High",   items: high },
            { label: "Medium", items: medium },
            { label: "Low",    items: low },
          ].map(({ label, items }) =>
            items.length > 0 ? (
              <section key={label}>
                <p
                  className="text-xs uppercase tracking-widest mb-2"
                  style={{ color: "var(--color-text-muted)", letterSpacing: "0.07em" }}
                >
                  {label}
                </p>
                <div
                  className="rounded-xl overflow-hidden"
                  style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)" }}
                >
                  {items.map((task, i) => (
                    <div key={task.id} style={i > 0 ? { borderTop: "1px solid var(--color-border)" } : {}}>
                      <TaskItem
                        task={task}
                        completeAction={completeTask}
                        archiveAction={archiveTask}
                        updateAction={updateTask}
                      />
                    </div>
                  ))}
                </div>
              </section>
            ) : null
          )}
        </div>
      )}

      {tasks.length === 0 && completedTasks.length === 0 && (
        <p style={{ fontSize: 14, color: "var(--color-text-faint)" }}>No tasks. Add one above.</p>
      )}

      {/* Completed section */}
      {completedTasks.length > 0 && (
        <CompletedTasks tasks={completedTasks} />
      )}
    </div>
  );
}
