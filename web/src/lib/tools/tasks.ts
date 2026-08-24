import { tool, jsonSchema } from "ai";
import { ok, err } from "./_contract";
import type { ToolContext } from "./_context";
import { scheduleTask, unscheduleTask } from "@/lib/tasks/schedule-task";
import {
  createSeries,
  deleteSeries,
  detachOccurrence,
  dismissSeriesExpiry,
  extendSeries,
  updateSeries,
} from "@/lib/tasks/series";
import { cadenceLabelWithEnd, type Freq } from "@/lib/tasks/recurrence";

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
            "id, title, priority, status, due_date, category, list_id, scheduled_start, scheduled_end, completed_at, created_at, series_id, occurrence_date",
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

    get_task_series: tool({
      description:
        "List the user's recurring task series (the repeat RULES, not the individual occurrences). Use to find a series_id before extending, editing or deleting a repeat. Individual occurrences come back from get_tasks and carry series_id.",
      inputSchema: jsonSchema<Record<string, never>>({ type: "object", properties: {} }),
      execute: async () => {
        let q = supabase
          .from("task_series")
          .select(
            "id, title, priority, list_id, freq, interval, byweekday, starts_on, ends_on, last_spawned, expiry_dismissed_at",
          )
          .order("created_at", { ascending: false });
        if (userId) q = q.eq("user_id", userId);
        const { data, error } = await q;
        if (error) return { error: error.message };
        return (data ?? []).map((s) => ({
          ...s,
          cadence: cadenceLabelWithEnd({
            freq: s.freq as Freq,
            interval: s.interval as number,
            byweekday: s.byweekday as number[] | null,
            ends_on: s.ends_on as string | null,
          }),
        }));
      },
    }),

    create_task_series: tool({
      description:
        "Create a RECURRING task, e.g. 'dose the aquarium every Sunday until 2026-12-31' or 'water the plants every 3 days'. This creates the repeat rule AND immediately materializes the next two weeks of occurrences as ordinary tasks. Use add_task instead for a one-off. Set ends_on whenever the user names a horizon — an open-ended series never warns before it stops.",
      inputSchema: jsonSchema<{
        title: string;
        freq: "daily" | "weekly" | "monthly";
        interval?: number;
        byweekday?: number[];
        starts_on?: string;
        ends_on?: string;
        priority?: "high" | "medium" | "low";
        list_id?: string;
      }>({
        type: "object",
        required: ["title", "freq"],
        properties: {
          title: { type: "string", description: "Task title, repeated for every occurrence." },
          freq: {
            type: "string",
            enum: ["daily", "weekly", "monthly"],
            description: "Base cadence. 'every 3 days' is freq=daily with interval=3.",
          },
          interval: {
            type: "number",
            description:
              "Repeat every N of freq. Defaults to 1. 'Every other week' is freq=weekly, interval=2.",
          },
          byweekday: {
            type: "array",
            items: { type: "number" },
            description:
              "Weekly only: days as 0=Sunday … 6=Saturday. 'Every Sunday' is [0]. Omit to use the weekday starts_on falls on.",
          },
          starts_on: { type: "string", description: "First date, YYYY-MM-DD. Defaults to today." },
          ends_on: {
            type: "string",
            description:
              "Last date, YYYY-MM-DD. Omit only for a genuinely open-ended chore — a series with no end date never produces an expiry warning.",
          },
          priority: { type: "string", enum: ["high", "medium", "low"] },
          list_id: { type: "string", description: "Task list UUID from get_task_lists." },
        },
      }),
      execute: async ({
        title,
        freq,
        interval,
        byweekday,
        starts_on,
        ends_on,
        priority,
        list_id,
      }) => {
        if (!userId) return err("No user context.");
        for (const [label, value] of [
          ["starts_on", starts_on],
          ["ends_on", ends_on],
        ] as const) {
          if (value && !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
            return err(`${label} must be YYYY-MM-DD format, got: "${value}"`);
          }
        }
        const today = new Date();
        const pad = (n: number) => String(n).padStart(2, "0");
        const todayStr = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;

        const res = await createSeries({
          supabase,
          userId,
          title,
          freq,
          interval: interval ?? 1,
          byweekday: byweekday ?? null,
          starts_on: starts_on ?? todayStr,
          ends_on: ends_on ?? null,
          priority: priority ?? null,
          list_id: list_id ?? null,
        });
        if (!res.ok) return err(res.error ?? "Failed to create series.");
        return ok({ series: res.series, occurrences_created: res.spawned ?? 0 });
      },
    }),

    update_task_series: tool({
      description:
        "Change a recurring task's RULE — its cadence, title, priority, list or end date. Future unfinished occurrences are regenerated from the new rule; completed ones keep the title they were done under. To change only ONE occurrence (move a single week's chore), use detach_task_occurrence then update the task normally.",
      inputSchema: jsonSchema<{
        id: string;
        title?: string;
        freq?: "daily" | "weekly" | "monthly";
        interval?: number;
        byweekday?: number[];
        starts_on?: string;
        ends_on?: string | null;
        priority?: "high" | "medium" | "low" | null;
        list_id?: string | null;
      }>({
        type: "object",
        required: ["id"],
        properties: {
          id: { type: "string", description: "Series UUID from get_task_series." },
          title: { type: "string" },
          freq: { type: "string", enum: ["daily", "weekly", "monthly"] },
          interval: { type: "number" },
          byweekday: { type: "array", items: { type: "number" }, description: "0=Sun … 6=Sat." },
          starts_on: { type: "string", description: "YYYY-MM-DD." },
          ends_on: { type: "string", description: "YYYY-MM-DD, or null to make it open-ended." },
          priority: { type: "string", enum: ["high", "medium", "low"] },
          list_id: { type: "string" },
        },
      }),
      execute: async ({ id, ...fields }) => {
        if (!userId) return err("No user context.");
        const clean = Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== undefined));
        if (!Object.keys(clean).length) return err("No fields to update.");
        const res = await updateSeries({
          supabase,
          userId,
          seriesId: id,
          fields: clean as Parameters<typeof updateSeries>[0]["fields"],
        });
        if (!res.ok) return err(res.error ?? "Failed to update series.");
        return ok({ series: res.series, occurrences_respawned: res.spawned ?? 0 });
      },
    }),

    extend_task_series: tool({
      description:
        "Push a recurring task's end date further out — the answer to an expiring-series warning. Defaults to 3 months past the current end (or past today if it has already lapsed), or pass ends_on for a specific date. Occurrences resume spawning immediately and the expiry warning re-arms for the new date.",
      inputSchema: jsonSchema<{ id: string; ends_on?: string; months?: number }>({
        type: "object",
        required: ["id"],
        properties: {
          id: { type: "string", description: "Series UUID." },
          ends_on: { type: "string", description: "Explicit new end date, YYYY-MM-DD." },
          months: { type: "number", description: "Months to add instead. Defaults to 3." },
        },
      }),
      execute: async ({ id, ends_on, months }) => {
        if (!userId) return err("No user context.");
        const res = await extendSeries({
          supabase,
          userId,
          seriesId: id,
          newEndsOn: ends_on ?? null,
          months: months ?? 3,
        });
        if (!res.ok) return err(res.error ?? "Failed to extend series.");
        return ok({ series: res.series, occurrences_created: res.spawned ?? 0 });
      },
    }),

    dismiss_series_expiry: tool({
      description:
        "'Let it end' — acknowledge that a recurring task is meant to stop, suppressing its expiry warning permanently. Use only when the user says the series should end; use extend_task_series if they want it to continue.",
      inputSchema: jsonSchema<{ id: string }>({
        type: "object",
        required: ["id"],
        properties: { id: { type: "string", description: "Series UUID." } },
      }),
      execute: async ({ id }) => {
        if (!userId) return err("No user context.");
        const res = await dismissSeriesExpiry({ supabase, userId, seriesId: id });
        if (!res.ok) return err(res.error ?? "Failed to dismiss.");
        return ok({ series: res.series });
      },
    }),

    delete_task_series: tool({
      description:
        "Stop a recurring task for good. Removes the rule and its future unfinished occurrences; already-completed ones stay in history as ordinary tasks.",
      inputSchema: jsonSchema<{ id: string }>({
        type: "object",
        required: ["id"],
        properties: { id: { type: "string", description: "Series UUID." } },
      }),
      execute: async ({ id }) => {
        if (!userId) return err("No user context.");
        const res = await deleteSeries({ supabase, userId, seriesId: id });
        if (!res.ok) return err(res.error ?? "Failed to delete series.");
        return ok({ deleted: true });
      },
    }),

    detach_task_occurrence: tool({
      description:
        "Split ONE occurrence out of its recurring series so it can be edited alone — move this week's chore to Tuesday without moving every future week. The task stays in the list but stops being governed by the rule, so a later series edit will not overwrite it. This is the 'this occurrence, not the series' path.",
      inputSchema: jsonSchema<{ id: string }>({
        type: "object",
        required: ["id"],
        properties: {
          id: { type: "string", description: "Task UUID (the occurrence, not the series)." },
        },
      }),
      execute: async ({ id }) => {
        if (!userId) return err("No user context.");
        const res = await detachOccurrence({ supabase, userId, taskId: id });
        if (!res.ok) return err(res.error ?? "Failed to detach occurrence.");
        return ok({ detached: true, task_id: id });
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
        "Put a task on the user's Google Calendar as a calendar block (or move an existing one). For a TIMED block, provide start (ISO 8601 with offset, e.g. 2026-08-20T14:00:00-07:00) and either end or duration_minutes. For an ALL-DAY block, set all_day:true and date (YYYY-MM-DD). Partial success: if Google isn't connected the block is still saved and calendar_synced is false.",
      inputSchema: jsonSchema<{
        id: string;
        all_day?: boolean;
        date?: string;
        start?: string;
        end?: string;
        duration_minutes?: number;
      }>({
        type: "object",
        required: ["id"],
        properties: {
          id: { type: "string", description: "Task UUID." },
          all_day: { type: "boolean", description: "True for an all-day block (needs date)." },
          date: { type: "string", description: "All-day date, YYYY-MM-DD." },
          start: {
            type: "string",
            description: "Timed block start, ISO 8601 with offset, e.g. 2026-08-20T14:00:00-07:00.",
          },
          end: { type: "string", description: "Timed block end, ISO 8601 with offset." },
          duration_minutes: {
            type: "number",
            description: "Timed block length if end is omitted. Defaults to 30.",
          },
        },
      }),
      execute: async ({ id, all_day, date, start, end, duration_minutes }) => {
        if (!userId) return err("No user context.");
        if (all_day) {
          if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
            return err("all_day requires date in YYYY-MM-DD format.");
          }
          const res = await scheduleTask({
            supabase,
            userId,
            taskId: id,
            block: { allDay: true, date },
          });
          if (!res.ok) return err(res.error ?? "Failed to schedule task.");
          return ok({
            all_day: true,
            date,
            calendar_synced: res.calendar_synced,
            ...(res.calendar_error ? { calendar_error: res.calendar_error } : {}),
          });
        }
        if (!start) return err("A timed block needs start (or set all_day + date).");
        const startMs = Date.parse(start);
        if (Number.isNaN(startMs)) return err(`start is not a valid ISO datetime: "${start}"`);
        let endMs: number;
        if (end) {
          endMs = Date.parse(end);
          if (Number.isNaN(endMs)) return err(`end is not a valid ISO datetime: "${end}"`);
        } else {
          const mins = duration_minutes && duration_minutes > 0 ? duration_minutes : 30;
          endMs = startMs + mins * 60_000;
        }
        if (endMs <= startMs) return err("end must be after start.");
        const startISO = new Date(startMs).toISOString();
        const endISO = new Date(endMs).toISOString();
        const res = await scheduleTask({
          supabase,
          userId,
          taskId: id,
          block: { allDay: false, startISO, endISO },
        });
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
