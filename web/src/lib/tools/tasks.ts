import { tool, jsonSchema } from "ai";
import { ok, err } from "./_contract";
import type { ToolContext } from "./_context";
import { scheduleTask, unscheduleTask } from "@/lib/tasks/schedule-task";

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
          .select(
            "id, title, priority, status, due_date, category, list_id, scheduled_start, scheduled_end, completed_at, created_at",
          )
          .eq("status", status)
          .order("created_at", { ascending: false });
        if (userId) q = q.eq("user_id", userId);
        const { data, error } = await q;
        if (error) return { error: error.message };
        return data ?? [];
      },
    }),

    get_task_lists: tool({
      description:
        "List the user's task lists (TickTick-style folders, e.g. Groceries, Health). Use to find a list_id before creating a task in it, or to check whether a list already exists.",
      inputSchema: jsonSchema<Record<string, never>>({ type: "object", properties: {} }),
      execute: async () => {
        let q = supabase
          .from("task_lists")
          .select("id, name, color, sort_order")
          .order("sort_order", { ascending: true })
          .order("name", { ascending: true });
        if (userId) q = q.eq("user_id", userId);
        const { data, error } = await q;
        if (error) return { error: error.message };
        return data ?? [];
      },
    }),

    create_task_list: tool({
      description:
        "Create a new task list (folder). Check get_task_lists first to avoid duplicates. Returns the new list including its id, which you can pass to add_task as list_id.",
      inputSchema: jsonSchema<{ name: string }>({
        type: "object",
        required: ["name"],
        properties: {
          name: { type: "string", description: "List name, e.g. 'Groceries' or 'Health'." },
        },
      }),
      execute: async ({ name }) => {
        const trimmed = name.trim();
        if (!trimmed) return err("List name cannot be empty.");
        // Case-insensitive dedup — a list is a folder, not a note; two 'Groceries' is a bug.
        const { data: existing } = await supabase
          .from("task_lists")
          .select("id, name, color, sort_order")
          .eq("user_id", userId)
          .ilike("name", trimmed)
          .maybeSingle();
        if (existing) return ok({ list: existing, deduped: true });

        const { data, error: insertError } = await supabase
          .from("task_lists")
          .insert({ user_id: userId, name: trimmed })
          .select("id, name, color, sort_order")
          .single();
        if (insertError) return err(insertError.message);
        if (!data) return err("Insert returned no row — list may not have been saved.");
        return ok({ list: data });
      },
    }),

    add_task: tool({
      description:
        "Add a new task or subtask. To put a task in a list (Groceries, Health, etc.), set list_id — call get_task_lists first, or create_task_list if the list doesn't exist yet. To add a checklist item UNDER an existing task, set parent_id (a subtask) instead. list_id groups top-level tasks; parent_id nests a task under another.",
      inputSchema: jsonSchema<{
        title: string;
        priority?: "high" | "medium" | "low";
        category?: string;
        list_id?: string;
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
          category: {
            type: "string",
            description: "Deprecated free-text category — prefer list_id.",
          },
          list_id: {
            type: "string",
            description:
              "Task list UUID (from get_task_lists / create_task_list) to file this task under.",
          },
          due_date: {
            type: "string",
            description: "Due date in YYYY-MM-DD format. Omit for subtasks.",
          },
          parent_id: {
            type: "string",
            description:
              "Parent task UUID. Set this to add a subtask/checklist item under an existing task.",
          },
        },
      }),
      execute: async ({ title, priority, category, list_id, due_date, parent_id }) => {
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
            // A subtask inherits its parent's list; only top-level tasks carry a list_id.
            list_id: parent_id ? null : (list_id ?? null),
            due_date: parent_id ? null : (due_date ?? null),
            status: "active",
            parent_id: parent_id ?? null,
          })
          .select("id, title, priority, status, due_date, category, list_id, parent_id, created_at")
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

    schedule_task: tool({
      description:
        "Put a task on the user's Google Calendar as a time block (or move an existing block). Provide start as an ISO 8601 datetime WITH offset (e.g. 2026-08-20T14:00:00-07:00) and a duration in minutes. Records the block on the task and creates/updates the calendar event. Partial success: if Google isn't connected the block is still saved and calendar_synced is false.",
      inputSchema: jsonSchema<{ id: string; start: string; duration_minutes?: number }>({
        type: "object",
        required: ["id", "start"],
        properties: {
          id: { type: "string", description: "Task UUID." },
          start: {
            type: "string",
            description: "ISO 8601 start datetime with UTC offset, e.g. 2026-08-20T14:00:00-07:00.",
          },
          duration_minutes: {
            type: "number",
            description: "Block length in minutes. Defaults to 30.",
          },
        },
      }),
      execute: async ({ id, start, duration_minutes }) => {
        if (!userId) return err("No user context.");
        const startMs = Date.parse(start);
        if (Number.isNaN(startMs)) return err(`start is not a valid ISO datetime: "${start}"`);
        const mins = duration_minutes && duration_minutes > 0 ? duration_minutes : 30;
        const startISO = new Date(startMs).toISOString();
        const endISO = new Date(startMs + mins * 60_000).toISOString();
        const res = await scheduleTask({ supabase, userId, taskId: id, startISO, endISO });
        if (!res.ok) return err(res.error ?? "Failed to schedule task.");
        return ok({
          scheduled_start: startISO,
          scheduled_end: endISO,
          calendar_synced: res.calendar_synced,
          ...(res.calendar_error ? { calendar_error: res.calendar_error } : {}),
        });
      },
    }),

    unschedule_task: tool({
      description:
        "Remove a task's calendar block: deletes its Google Calendar event and clears the block on the task.",
      inputSchema: jsonSchema<{ id: string }>({
        type: "object",
        required: ["id"],
        properties: { id: { type: "string", description: "Task UUID." } },
      }),
      execute: async ({ id }) => {
        if (!userId) return err("No user context.");
        const res = await unscheduleTask({ supabase, userId, taskId: id });
        if (!res.ok) return err(res.error ?? "Failed to unschedule task.");
        return ok({
          calendar_synced: res.calendar_synced,
          ...(res.calendar_error ? { calendar_error: res.calendar_error } : {}),
        });
      },
    }),
  };
}
