import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import TaskItem from "@/components/tasks/task-item";
import AddTaskForm from "@/components/tasks/add-task-form";
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
    revalidatePath("/");
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
    revalidatePath("/");
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
    revalidatePath("/");
    return {};
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to archive task" };
  }
}

const priorityOrder = { high: 0, medium: 1, low: 2 };

export default async function TasksPage() {
  const supabase = await createClient();

  const { data } = await supabase
    .from("tasks")
    .select("*")
    .eq("status", "active")
    .order("created_at", { ascending: false });

  const tasks = ((data ?? []) as Task[]).sort(
    (a, b) =>
      (priorityOrder[a.priority ?? "low"] ?? 2) -
      (priorityOrder[b.priority ?? "low"] ?? 2)
  );

  const high = tasks.filter((t) => t.priority === "high");
  const medium = tasks.filter((t) => t.priority === "medium");
  const low = tasks.filter((t) => t.priority === "low" || !t.priority);

  return (
    <div className="pt-8 space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-neutral-100">Tasks</h1>
        <p className="text-sm text-neutral-500 mt-0.5">{tasks.length} active</p>
      </div>

      <AddTaskForm addAction={addTask} />

      {[
        { label: "High priority", items: high },
        { label: "Medium priority", items: medium },
        { label: "Low priority", items: low },
      ].map(
        ({ label, items }) =>
          items.length > 0 && (
            <section key={label}>
              <h2 className="text-xs text-neutral-500 uppercase tracking-wide mb-2">{label}</h2>
              <div className="divide-y divide-neutral-800/50">
                {items.map((task) => (
                  <TaskItem
                    key={task.id}
                    task={task}
                    completeAction={completeTask}
                    archiveAction={archiveTask}
                  />
                ))}
              </div>
            </section>
          )
      )}

      {tasks.length === 0 && (
        <p className="text-sm text-neutral-600 pt-2">No active tasks.</p>
      )}
    </div>
  );
}
