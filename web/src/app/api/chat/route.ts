import { anthropic } from "@ai-sdk/anthropic";
import { todayString, daysAgoString } from "@/lib/timezone";
import { streamText, tool, jsonSchema, wrapLanguageModel } from "ai";
import type { LanguageModelV1Middleware } from "ai";
import { createServiceClient } from "@/lib/supabase/service";
import { google } from "googleapis";
import { getGoogleAuthClient } from "@/lib/google-auth";

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

  // Fetch user name from profile for personalised system prompt
  let userName: string | null = null;
  const { data: nameRow } = await supabase
    .from("profile")
    .select("value")
    .eq("key", "name")
    .maybeSingle();
  if (nameRow) userName = nameRow.value as string;

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

  const userLabel = userName ?? "the user";
  const systemPrompt = `You are Mr. Bridge, ${userLabel}'s personal AI assistant.
${userName ? `Address the user as "${userName}" — use their name naturally in conversation, not robotically after every sentence.` : 'If you learn the user\'s name during the conversation, use it naturally going forward.'}

Style: Direct, structured, high-density. No filler, no emojis, no motivational language.
Quantify wherever possible. Conservative estimates. Lead with the answer, then reasoning.

You have access to the user's Supabase data via tools. Use them when asked about current data — do not say you lack access.

Tools available:
- get_tasks: active/completed/archived tasks
- add_task: create a new task
- complete_task: mark a task done by ID
- get_habits_today: all active habits + today's completion status
- log_habit: mark a habit complete for a given date
- get_fitness_summary: recent body composition, workouts, recovery metrics
- get_profile: profile key/value store
- search_gmail: search Gmail with any query string, returns message IDs + metadata
- get_email_body: fetch and decode the full plain-text body of an email by message ID
- create_calendar_event: create a Google Calendar event on the primary calendar
- get_recipes: search saved recipes by ingredient, name, or tag; omit query to return all
- log_meal: log a meal by type (breakfast/lunch/dinner/snack) with optional recipe link or notes

Recipes and meal planning are in scope. When asked what to cook given ingredients on hand:
1. Call get_recipes to check for saved recipes that match.
2. Call get_fitness_summary to pull recent body composition, goals, and workout data — use this to calibrate the recommendation (e.g. prioritize protein post-workout, suggest lower-calorie options if in a deficit phase).
3. Call get_profile to check for dietary preferences, pantry staples, and cuisine preferences stored in the user's profile.
4. Always provide a concrete recipe recommendation — either from saved recipes or improvised from your own knowledge. Do not redirect to external tools.
5. Include estimated calories, protein, carbs, and fat for the suggested recipe. Flag if the meal is a poor fit for current fitness context (e.g. high-calorie meal after a rest day, low protein after a hard workout).
6. Improvise confidently when no saved recipe fits, using any dietary preferences from the profile as guidance.`;

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
        const targetDate = date ?? todayString();
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
        const targetDate = date ?? todayString();
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
        const sinceStr = daysAgoString(days);

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

    search_gmail: tool({
      description:
        "Search Gmail using any Gmail query string (e.g. 'from:regal tickets', 'subject:invoice is:unread'). Returns message ID, sender, subject, and date. Use get_email_body to read the full content of a specific message.",
      parameters: jsonSchema<{ query: string; max_results?: number }>({
        type: "object",
        required: ["query"],
        properties: {
          query: {
            type: "string",
            description: "Gmail search query. Supports all Gmail search operators.",
          },
          max_results: {
            type: "number",
            description: "Max messages to return. Defaults to 5, max 10.",
          },
        },
      }),
      execute: async ({ query, max_results = 5 }) => {
        try {
          const auth = getGoogleAuthClient();
          const gmail = google.gmail({ version: "v1", auth });

          const listRes = await gmail.users.messages.list({
            userId: "me",
            q: query,
            maxResults: Math.min(max_results, 10),
          });

          const messages = listRes.data.messages ?? [];
          if (messages.length === 0) return { results: [] };

          const getHeader = (
            headers: { name?: string | null; value?: string | null }[],
            name: string
          ) => headers.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value ?? "";

          const summaries = await Promise.all(
            messages.map(async (m) => {
              const msg = await gmail.users.messages.get({
                userId: "me",
                id: m.id!,
                format: "metadata",
                metadataHeaders: ["From", "Subject", "Date"],
              });
              const headers = msg.data.payload?.headers ?? [];
              return {
                id: m.id,
                from: getHeader(headers, "From"),
                subject: getHeader(headers, "Subject") || "(No subject)",
                date: getHeader(headers, "Date"),
              };
            })
          );

          return { results: summaries };
        } catch (err) {
          return { error: err instanceof Error ? err.message : "Gmail search failed" };
        }
      },
    }),

    get_email_body: tool({
      description:
        "Fetch the full text body of a Gmail message by its ID. Use this after search_gmail to read email content. Returns decoded plain text.",
      parameters: jsonSchema<{ message_id: string }>({
        type: "object",
        required: ["message_id"],
        properties: {
          message_id: {
            type: "string",
            description: "The Gmail message ID from search_gmail results.",
          },
        },
      }),
      execute: async ({ message_id }) => {
        try {
          const auth = getGoogleAuthClient();
          const gmail = google.gmail({ version: "v1", auth });

          const msg = await gmail.users.messages.get({
            userId: "me",
            id: message_id,
            format: "full",
          });

          const headers = msg.data.payload?.headers ?? [];
          const getHeader = (name: string) =>
            headers.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value ?? "";

          type Part = {
            mimeType?: string | null;
            body?: { data?: string | null } | null;
            parts?: Part[] | null;
          };

          function findBody(parts: Part[], mime: string): string | null {
            for (const part of parts) {
              if (part.mimeType === mime && part.body?.data) {
                return Buffer.from(part.body.data, "base64url").toString("utf-8");
              }
              if (part.parts) {
                const found = findBody(part.parts, mime);
                if (found) return found;
              }
            }
            return null;
          }

          const payload = msg.data.payload;
          let body: string | null = null;

          if (payload?.body?.data) {
            body = Buffer.from(payload.body.data, "base64url").toString("utf-8");
          } else if (payload?.parts) {
            body = findBody(payload.parts as Part[], "text/plain");
            if (!body) {
              const html = findBody(payload.parts as Part[], "text/html");
              if (html) body = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
            }
          }

          const truncated = body ? body.slice(0, 4000) : null;

          return {
            id: message_id,
            from: getHeader("From"),
            subject: getHeader("Subject"),
            date: getHeader("Date"),
            body: truncated ?? "(No readable body found)",
            truncated: body ? body.length > 4000 : false,
          };
        } catch (err) {
          return { error: err instanceof Error ? err.message : "Failed to fetch email body" };
        }
      },
    }),

    create_calendar_event: tool({
      description:
        "Create a new event on the primary Google Calendar. For timed events, provide date + start_time. For all-day events, set all_day: true and provide only date.",
      parameters: jsonSchema<{
        title: string;
        date: string;
        start_time?: string;
        end_time?: string;
        location?: string;
        description?: string;
        all_day?: boolean;
      }>({
        type: "object",
        required: ["title", "date"],
        properties: {
          title: { type: "string", description: "Event title/summary." },
          date: { type: "string", description: "Date in YYYY-MM-DD format." },
          start_time: {
            type: "string",
            description: "Start time in HH:MM (24h) format. Required for timed events.",
          },
          end_time: {
            type: "string",
            description: "End time in HH:MM (24h) format. Defaults to start_time + 2 hours.",
          },
          location: { type: "string", description: "Event location." },
          description: { type: "string", description: "Event description or notes." },
          all_day: {
            type: "boolean",
            description: "If true, creates an all-day event. start_time and end_time are ignored.",
          },
        },
      }),
      execute: async ({ title, date, start_time, end_time, location, description, all_day = false }) => {
        try {
          if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
            return { error: `date must be YYYY-MM-DD, got: "${date}"` };
          }
          if (!all_day && !start_time) {
            return { error: "start_time is required for timed events. Use all_day: true for all-day events." };
          }

          const auth = getGoogleAuthClient();
          const calendar = google.calendar({ version: "v3", auth });
          const tz = process.env.USER_TIMEZONE ?? "America/Los_Angeles";

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          let eventBody: Record<string, any>;

          if (all_day) {
            eventBody = {
              summary: title,
              start: { date },
              end: { date },
              ...(location ? { location } : {}),
              ...(description ? { description } : {}),
            };
          } else {
            let computedEnd = end_time;
            if (!computedEnd) {
              const [h, m] = start_time!.split(":").map(Number);
              computedEnd = `${String((h + 2) % 24).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
            }
            eventBody = {
              summary: title,
              start: { dateTime: `${date}T${start_time}:00`, timeZone: tz },
              end: { dateTime: `${date}T${computedEnd}:00`, timeZone: tz },
              ...(location ? { location } : {}),
              ...(description ? { description } : {}),
            };
          }

          const res = await calendar.events.insert({
            calendarId: "primary",
            requestBody: eventBody,
          });

          return {
            id: res.data.id,
            title: res.data.summary,
            start: res.data.start,
            end: res.data.end,
            link: res.data.htmlLink,
          };
        } catch (err) {
          return { error: err instanceof Error ? err.message : "Failed to create calendar event" };
        }
      },
    }),

    get_recipes: tool({
      description: "Search saved recipes by ingredient, name, or tag. Omit query to return all recipes.",
      parameters: jsonSchema<{ query?: string }>({
        type: "object",
        properties: {
          query: { type: "string", description: "Ingredient, recipe name, or tag to search for." },
        },
      }),
      execute: async ({ query }) => {
        let req = supabase
          .from("recipes")
          .select("id, name, cuisine, ingredients, instructions, tags");
        if (query) {
          req = req.or(`name.ilike.%${query}%,ingredients.ilike.%${query}%`);
        }
        const { data, error } = await req.order("name");
        if (error) return { error: error.message };
        return data ?? [];
      },
    }),

    log_meal: tool({
      description: "Log a meal to the meal_log table.",
      parameters: jsonSchema<{
        meal_type: "breakfast" | "lunch" | "dinner" | "snack";
        notes?: string;
        recipe_id?: string;
        date?: string;
      }>({
        type: "object",
        required: ["meal_type"],
        properties: {
          meal_type: { type: "string", enum: ["breakfast", "lunch", "dinner", "snack"], description: "Meal type." },
          notes: { type: "string", description: "Free-text meal description." },
          recipe_id: { type: "string", description: "UUID of a saved recipe." },
          date: { type: "string", description: "Date in YYYY-MM-DD format. Defaults to today." },
        },
      }),
      execute: async ({ meal_type, notes, recipe_id, date }) => {
        const { data, error } = await supabase
          .from("meal_log")
          .insert({
            meal_type,
            notes: notes ?? null,
            recipe_id: recipe_id ?? null,
            date: date ?? todayString(),
          })
          .select()
          .single();
        if (error) return { error: error.message };
        return data;
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
