import { anthropic } from "@ai-sdk/anthropic";
import { streamText, tool, jsonSchema, wrapLanguageModel } from "ai";
import type { LanguageModelV1Middleware } from "ai";
import { createServiceClient } from "@/lib/supabase/service";

const retryOnOverload: LanguageModelV1Middleware = {
  wrapStream: async ({ doStream }) => {
    for (let attempt = 0; attempt <= 2; attempt++) {
      if (attempt > 0) {
        const delay = attempt * 1500;
        console.log(`[chat] API overloaded, retrying in ${delay}ms (attempt ${attempt + 1})`);
        await new Promise((r) => setTimeout(r, delay));
      }
      try {
        return await doStream();
      } catch (err) {
        const isOverloaded =
          err instanceof Error &&
          (err.message.toLowerCase().includes("overload") ||
            (err as { status?: number }).status === 529);
        if (!isOverloaded || attempt === 2) throw err;
      }
    }
    throw new Error("Max retries exceeded");
  },
};

export const maxDuration = 60;

export async function POST(req: Request) {
  const { messages, sessionId } = await req.json();
  console.log("[chat] sessionId:", sessionId, "messages:", messages.length);

  const supabase = createServiceClient();

  // Load the last 20 messages from this session as context
  let contextMessages: { role: "user" | "assistant"; content: string }[] = [];
  if (sessionId) {
    const { data } = await supabase
      .from("chat_messages")
      .select("role, content")
      .eq("session_id", sessionId)
      .in("role", ["user", "assistant"])
      .order("created_at", { ascending: true })
      .limit(20);
    if (data) {
      // Filter out empty-content messages — they cause Anthropic 400 errors
      contextMessages = (data as { role: "user" | "assistant"; content: string }[]).filter(
        (m) => m.content.trim() !== ""
      );
    }
  }

  const systemPrompt = `You are Mr. Bridge, Jason's personal AI assistant.

Style: Direct, structured, high-density. No filler, no emojis, no motivational language.
Quantify wherever possible. Conservative estimates. Lead with the answer, then reasoning.

You have access to Jason's Supabase data via tools. Use them when asked about current data — do not say you lack access.

Tools available:
- get_tasks: active/completed/archived tasks
- add_task: create a new task
- complete_task: mark a task done by ID
- get_habits_today: all active habits + today's completion status
- log_habit: mark a habit complete for a given date
- get_fitness_summary: recent body composition, workouts, recovery metrics
- get_profile: profile key/value store`;

  // Strip extra fields (parts, id, etc.) that useChat adds — Anthropic only wants role + content
  // Also filter empty-content messages to prevent Anthropic 400 errors
  const cleanMessages = messages
    .map((m: { role: "user" | "assistant"; content: string }) => ({
      role: m.role,
      content: m.content,
    }))
    .filter((m: { role: "user" | "assistant"; content: string }) => m.content.trim() !== "");

  const tools = {
    get_tasks: tool({
      description: "Fetch tasks from the tasks table. Defaults to active tasks.",
      parameters: jsonSchema<{ status?: "active" | "completed" | "archived" }>({
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
        const { data, error } = await supabase
          .from("tasks")
          .select("id, title, priority, status, due_date, category, completed_at, created_at")
          .eq("status", status)
          .order("created_at", { ascending: false });
        if (error) return { error: error.message };
        return data ?? [];
      },
    }),

    add_task: tool({
      description: "Add a new task to the tasks table.",
      parameters: jsonSchema<{
        title: string;
        priority?: "high" | "medium" | "low";
        category?: string;
        due_date?: string;
      }>({
        type: "object",
        required: ["title"],
        properties: {
          title: { type: "string", description: "Task title." },
          priority: {
            type: "string",
            enum: ["high", "medium", "low"],
            description: "Task priority.",
          },
          category: { type: "string", description: "Task category." },
          due_date: { type: "string", description: "Due date in YYYY-MM-DD format." },
        },
      }),
      execute: async ({ title, priority, category, due_date }) => {
        if (due_date && !/^\d{4}-\d{2}-\d{2}$/.test(due_date)) {
          return { error: `due_date must be YYYY-MM-DD format, got: "${due_date}"` };
        }
        const { data, error } = await supabase
          .from("tasks")
          .insert({ title, priority: priority ?? null, category: category ?? null, due_date: due_date ?? null, status: "active" })
          .select("id, title, priority, status, due_date, category, created_at")
          .single();
        if (error) return { error: error.message };
        return data;
      },
    }),

    complete_task: tool({
      description: "Mark a task as completed by its ID.",
      parameters: jsonSchema<{ id: string }>({
        type: "object",
        required: ["id"],
        properties: {
          id: { type: "string", description: "Task UUID." },
        },
      }),
      execute: async ({ id }) => {
        const { data, error } = await supabase
          .from("tasks")
          .update({ status: "completed", completed_at: new Date().toISOString() })
          .eq("id", id)
          .select("id, title, status, completed_at")
          .single();
        if (error) return { error: error.message };
        return data;
      },
    }),

    get_habits_today: tool({
      description: "Get all active habits and their completion status for today (or a specified date).",
      parameters: jsonSchema<{ date?: string }>({
        type: "object",
        properties: {
          date: { type: "string", description: "Date in YYYY-MM-DD format. Defaults to today." },
        },
      }),
      execute: async ({ date }) => {
        const targetDate = date ?? new Date().toISOString().slice(0, 10);
        const [registryResult, logsResult] = await Promise.all([
          supabase.from("habit_registry").select("id, name, emoji, category").eq("active", true),
          supabase.from("habits").select("habit_id, completed, notes").eq("date", targetDate),
        ]);
        if (registryResult.error) return { error: registryResult.error.message };
        const logMap = new Map(
          (logsResult.data ?? []).map((l: { habit_id: string; completed: boolean; notes: string | null }) => [l.habit_id, l])
        );
        return (registryResult.data ?? []).map((h: { id: string; name: string; emoji: string | null; category: string | null }) => ({
          id: h.id,
          name: h.name,
          emoji: h.emoji,
          category: h.category,
          completed: logMap.get(h.id)?.completed ?? false,
          notes: logMap.get(h.id)?.notes ?? null,
        }));
      },
    }),

    log_habit: tool({
      description: "Log a habit as completed. Looks up the habit by name from the registry.",
      parameters: jsonSchema<{ name: string; date?: string; notes?: string }>({
        type: "object",
        required: ["name"],
        properties: {
          name: { type: "string", description: "Habit name (case-insensitive partial match)." },
          date: { type: "string", description: "Date in YYYY-MM-DD format. Defaults to today." },
          notes: { type: "string", description: "Optional notes." },
        },
      }),
      execute: async ({ name, date, notes }) => {
        const targetDate = date ?? new Date().toISOString().slice(0, 10);
        const { data: habits, error: lookupError } = await supabase
          .from("habit_registry")
          .select("id, name")
          .ilike("name", `%${name}%`)
          .eq("active", true)
          .limit(1);
        if (lookupError) return { error: lookupError.message };
        if (!habits || habits.length === 0) return { error: `No active habit matching "${name}" found.` };
        const habit = habits[0];
        const { data, error } = await supabase
          .from("habits")
          .upsert(
            { habit_id: habit.id, date: targetDate, completed: true, notes: notes ?? null },
            { onConflict: "habit_id,date" }
          )
          .select("habit_id, date, completed, notes")
          .single();
        if (error) return { error: error.message };
        return { habit: habit.name, ...data };
      },
    }),

    get_fitness_summary: tool({
      description: "Get recent body composition, workouts, and recovery metrics.",
      parameters: jsonSchema<{ days?: number }>({
        type: "object",
        properties: {
          days: {
            type: "number",
            description: "Number of days back to include for workouts. Defaults to 7.",
          },
        },
      }),
      execute: async ({ days = 7 }) => {
        const since = new Date();
        since.setDate(since.getDate() - days);
        const sinceStr = since.toISOString().slice(0, 10);

        const [bodyCompResult, workoutsResult, recoveryResult] = await Promise.all([
          supabase
            .from("fitness_log")
            .select("date, weight_lb, body_fat_pct, bmi, muscle_mass_lb, visceral_fat, source")
            .not("body_fat_pct", "is", null)
            .order("date", { ascending: false })
            .limit(2),
          supabase
            .from("workout_sessions")
            .select("date, activity, duration_mins, calories, avg_hr, notes")
            .gte("date", sinceStr)
            .order("date", { ascending: false }),
          supabase
            .from("recovery_metrics")
            .select("date, avg_hrv, resting_hr, sleep_score, readiness, source")
            .order("date", { ascending: false })
            .limit(1),
        ]);

        return {
          body_composition: bodyCompResult.data ?? [],
          workouts: workoutsResult.data ?? [],
          recovery: recoveryResult.data?.[0] ?? null,
        };
      },
    }),

    get_profile: tool({
      description: "Get all profile key/value entries.",
      parameters: jsonSchema<Record<string, never>>({
        type: "object",
        properties: {},
      }),
      execute: async () => {
        const { data, error } = await supabase
          .from("profile")
          .select("key, value, updated_at")
          .order("key", { ascending: true });
        if (error) return { error: error.message };
        return data ?? [];
      },
    }),
  };

  const result = streamText({
    model: wrapLanguageModel({ model: anthropic("claude-sonnet-4-6"), middleware: retryOnOverload }),
    system: systemPrompt,
    messages: [...contextMessages, ...cleanMessages],
    tools,
    maxSteps: 5,
    onError: ({ error }) => {
      console.error("[chat] streamText error:", JSON.stringify(error));
    },
    onFinish: async ({ text }) => {
      if (!sessionId) return;
      if (!text.trim()) return; // Don't persist empty assistant responses (failed/tool-only steps)

      const lastUserMessage = messages[messages.length - 1];

      try {
        const { error: insertError } = await supabase.from("chat_messages").insert([
          {
            session_id: sessionId,
            role: "user",
            content: lastUserMessage.content,
          },
          {
            session_id: sessionId,
            role: "assistant",
            content: text,
          },
        ]);
        if (insertError) throw insertError;

        const { error: updateError } = await supabase
          .from("chat_sessions")
          .update({ last_active_at: new Date().toISOString() })
          .eq("id", sessionId);
        if (updateError) throw updateError;
      } catch (err) {
        console.error("[chat] onFinish persist error:", err);
      }
    },
  });

  return result.toDataStreamResponse();
}
