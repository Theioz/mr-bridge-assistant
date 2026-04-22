import { tool, jsonSchema } from "ai";
import { ok, err } from "./_contract";
import type { ToolContext } from "./_context";

export function buildTasksTools({ supabase, userId }: ToolContext) {
  return {
    get_tasks: tool({
      description: "Fetch tasks from the tasks table. Defaults to active tasks.",
      inputSchema: jsonSchema<{ status?: "active" | "completed" | "archived" }>({
        type: "object",
        properties: {
          status: {
            type: "string",
            enum: ["active", "completed", "archived"],
            description: "Task status filter. Defaults to 'active'.",
          },
        },
      }),
      execute: async ({ status = "active" }) => {
        let q = supabase
          .from("tasks")
          .select("id, title, priority, status, due_date, category, completed_at, created_at")
          .eq("status", status)
          .order("created_at", { ascending: false });
        if (userId) q = q.eq("user_id", userId);
        const { data, error } = await q;
        if (error) return { error: error.message };
        return data ?? [];
      },
    }),

    add_task: tool({
      description:
        "Add a new task or subtask to the tasks table. To add an item to a list (e.g. shopping list, grocery list), first call get_tasks to find the parent task ID, then call add_task with parent_id set.",
      inputSchema: jsonSchema<{
        title: string;
        priority?: "high" | "medium" | "low";
        category?: string;
        due_date?: string;
        parent_id?: string;
      }>({
        type: "object",
        required: ["title"],
        properties: {
          title: { type: "string", description: "Task title." },
          priority: {
            type: "string",
            enum: ["high", "medium", "low"],
            description: "Task priority. Omit for subtasks.",
          },
          category: { type: "string", description: "Task category." },
          due_date: {
            type: "string",
            description: "Due date in YYYY-MM-DD format. Omit for subtasks.",
          },
          parent_id: {
            type: "string",
            description:
              "Parent task UUID. Set this to add a subtask/list item under an existing task.",
          },
        },
      }),
      execute: async ({ title, priority, category, due_date, parent_id }) => {
        if (due_date && !/^\d{4}-\d{2}-\d{2}$/.test(due_date)) {
          return err(`due_date must be YYYY-MM-DD format, got: "${due_date}"`);
        }

        // Deduplication guard — prevents double-inserts from stream retries
        const windowStart = new Date(Date.now() - 90_000).toISOString();
        let dupQuery = supabase
          .from("tasks")
          .select("id, title, priority, status, due_date, category, parent_id, created_at")
          .eq("user_id", userId)
          .eq("status", "active")
          .ilike("title", title.trim())
          .gte("created_at", windowStart);

        if (due_date) {
          dupQuery = dupQuery.eq("due_date", due_date);
        } else {
          dupQuery = dupQuery.is("due_date", null);
        }

        const { data: existing } = await dupQuery.maybeSingle();
        if (existing) return ok({ task: existing, deduped: true });

        const { data, error: insertError } = await supabase
          .from("tasks")
          .insert({
            user_id: userId,
            title,
            priority: parent_id ? null : (priority ?? null),
            category: category ?? null,
            due_date: parent_id ? null : (due_date ?? null),
            status: "active",
            parent_id: parent_id ?? null,
          })
          .select("id, title, priority, status, due_date, category, parent_id, created_at")
          .single();
        if (insertError) return err(insertError.message);
        if (!data) return err("Insert returned no row — task may not have been saved.");
        return ok({ task: data });
      },
    }),

    complete_task: tool({
      description: "Mark a task as completed by its ID.",
      inputSchema: jsonSchema<{ id: string }>({
        type: "object",
        required: ["id"],
        properties: {
          id: { type: "string", description: "Task UUID." },
        },
      }),
      execute: async ({ id }) => {
        let q = supabase
          .from("tasks")
          .update({ status: "completed", completed_at: new Date().toISOString() })
          .eq("id", id);
        if (userId) q = q.eq("user_id", userId);
        const { data, error: updateError } = await q
          .select("id, title, status, completed_at")
          .maybeSingle();
        if (updateError) return err(updateError.message);
        if (!data)
          return err(`No active task found with id ${id} for this user — nothing was changed.`);
        return ok({ task: data });
      },
    }),
  };
}
