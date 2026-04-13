import { anthropic } from "@ai-sdk/anthropic";
import { createGroq } from "@ai-sdk/groq";
import { todayString, daysAgoString, startOfDayRFC3339, endOfDayRFC3339, addDays } from "@/lib/timezone";
import { streamText, tool, jsonSchema, wrapLanguageModel } from "ai";
import type { LanguageModelV1Middleware } from "ai";
import { createServiceClient } from "@/lib/supabase/service";
import { createClient } from "@/lib/supabase/server";
import { google } from "googleapis";
import { getGoogleAuthClient } from "@/lib/google-auth";

// ── Demo mock data ───────────────────────────────────────────────────────────
const DEMO_EMAILS = [
  {
    id: "demo-email-1",
    from: "UPS Tracking <tracking@ups.com>",
    subject: "Your package is out for delivery today",
    date: "Mon, 13 Apr 2026 08:14:00 -0700",
    body: "Hi Alex, your package is out for delivery today. Estimated delivery: today by 8pm. Track at ups.com.",
  },
  {
    id: "demo-email-2",
    from: "Alaska Airlines <noreply@alaskaair.com>",
    subject: "Flight Confirmation: SFO → SEA Apr 20",
    date: "Thu, 10 Apr 2026 11:02:00 -0700",
    body: "Your flight AS 321 on April 20 from San Francisco (SFO) to Seattle (SEA) is confirmed. Departs 7:45am, arrives 9:50am. Confirmation code: KXZP94.",
  },
  {
    id: "demo-email-3",
    from: "Figma <notifications@figma.com>",
    subject: "Action required: Accept team invite from Lena Park",
    date: "Mon, 13 Apr 2026 09:47:00 -0700",
    body: "Lena Park has invited you to join the 'Product Design' team on Figma. Click here to accept.",
  },
  {
    id: "demo-email-4",
    from: "Hacker News Digest <digest@hackernewsdigest.com>",
    subject: "Top stories: Llama 4 benchmarks, SQLite as a backend",
    date: "Mon, 13 Apr 2026 06:30:00 -0700",
    body: "Top HN stories this week: Llama 4 beats GPT-4o on several benchmarks; SQLite as production backend — when it makes sense; Cloudflare Workers hits 100M active deployments.",
  },
  {
    id: "demo-email-5",
    from: "DocuSign <dse@docusign.net>",
    subject: "Invoice #4421 — please sign",
    date: "Fri, 11 Apr 2026 15:12:00 -0700",
    body: "Alex Chen, a document has been sent to you for signature by Acme Corp. Invoice #4421 for $1,240.00 is ready for your review. This request will expire in 7 days.",
  },
];

const DEMO_CALENDAR_EVENTS = [
  { title: "Morning run", start: `${new Date().toISOString().slice(0, 10)}T06:30:00`, end: `${new Date().toISOString().slice(0, 10)}T07:15:00`, allDay: false, calendar: "Alex Chen", calendarType: "primary", location: null },
  { title: "Team standup", start: `${new Date().toISOString().slice(0, 10)}T09:00:00`, end: `${new Date().toISOString().slice(0, 10)}T09:30:00`, allDay: false, calendar: "Alex Chen", calendarType: "primary", location: "Google Meet" },
  { title: "Lunch w/ Priya", start: `${new Date().toISOString().slice(0, 10)}T12:30:00`, end: `${new Date().toISOString().slice(0, 10)}T13:30:00`, allDay: false, calendar: "Alex Chen", calendarType: "primary", location: "Tartine Manufactory" },
  { title: "Gym — push day", start: `${new Date().toISOString().slice(0, 10)}T18:00:00`, end: `${new Date().toISOString().slice(0, 10)}T19:00:00`, allDay: false, calendar: "Alex Chen", calendarType: "primary", location: "Equinox SoMa" },
];

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

function selectModel(messages: { role: string; content: unknown }[]): "haiku" | "sonnet" {
  const lastUser = [...messages].reverse().find((m) => m.role === "user");
  if (!lastUser || typeof lastUser.content !== "string") return "sonnet";
  const msg = lastUser.content.toLowerCase().trim();
  if (!msg) return "sonnet";

  // Gate 1: length
  if (msg.length > 280) return "sonnet";

  // Gate 2: sentence count
  const sentences = msg.split(/[.!?]+/).filter((s) => s.trim().length > 0);
  if (sentences.length >= 3) return "sonnet";

  // Gate 3: complex keywords
  const complexPatterns = [
    "analyze", "analysis", "recommend", "should i", "what should",
    "plan", "strategy", "help me", "best way", "optimize", "review",
    "compare", "versus", " vs ", "summarize", "summary", "trend",
    "progress", "what do you think", "advice", "suggest", "improve",
    "breakdown", "fitness goal", "meal plan", "workout plan",
    "schedule strategy", "is it worth", "explain why",
    "set my goal", "save my goal", "update my goal", "set my target",
    "save that", "save these", "write that to", "lock that in",
  ];
  if (complexPatterns.some((p) => msg.includes(p))) return "sonnet";

  // Gate 4: simple command patterns
  const simplePatterns = [
    /add task/, /create task/, /new task/, /complete task/,
    /mark.{0,20}done/, /mark.{0,20}complete/, /finish task/,
    /log habit/, /log.{0,10}meal/, /had.{0,30}for (breakfast|lunch|dinner|snack)/,
    /create event/, /add event/, /schedule.{0,20}at \d/, /book.{0,20}at \d/,
    /show.{0,10}tasks/, /list.{0,10}tasks/, /get.{0,10}tasks/, /what.{0,10}tasks/,
    /check habits/, /show habits/, /get recipes/, /find recipes/, /what.{0,20}recipes/,
    /my habits today/,
  ];
  if (simplePatterns.some((p) => p.test(msg))) return "haiku";

  return "sonnet";
}

export const maxDuration = 60;

export async function POST(req: Request) {
  const { messages, sessionId } = await req.json();
  console.log("[chat] sessionId:", sessionId, "messages:", messages.length);

  // Resolve the authenticated user (needed for per-user data scoping)
  const serverClient = await createClient();
  const { data: { user } } = await serverClient.auth.getUser();
  const userId = user?.id ?? null;
  const demoUserId = process.env.DEMO_USER_ID ?? null;
  const isDemo = !!(userId && demoUserId && userId === demoUserId);

  const supabase = createServiceClient();

  // Fetch user name from profile for personalised system prompt
  let userName: string | null = null;
  if (userId) {
    const { data: nameRow } = await supabase
      .from("profile")
      .select("value")
      .eq("user_id", userId)
      .eq("key", "name")
      .maybeSingle();
    if (nameRow) userName = nameRow.value as string;
  }

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

  const userLabel = userName ?? (isDemo ? "Alex" : "the user");
  const systemPrompt = isDemo
    ? `You are Mr. Bridge, a personal AI assistant. Today's date is ${todayString()}.
You are currently running in demo mode for a fictional persona: Alex Chen, a software engineer based in San Francisco.
Address the user as "Alex" — naturally in conversation, not robotically after every sentence.

Style: Direct, structured, high-density. No filler, no emojis, no motivational language.
Quantify wherever possible. Conservative estimates. Lead with the answer, then reasoning.
Do not narrate before calling tools. Call the tool directly and respond after.

This is a demo account with realistic but fictional data. All data changes are reset nightly.
You have access to Alex's demo data via tools: tasks, habits, fitness, recovery, profile, recipes, meal log, Gmail (simulated), and Calendar (simulated).

Tools available:
- get_tasks, add_task, complete_task
- get_habits_today, log_habit
- get_fitness_summary
- get_profile, update_profile
- search_gmail, get_email_body (returns demo emails)
- list_calendar_events, create_calendar_event (returns demo events)
- get_recipes, log_meal`
    : `You are Mr. Bridge, ${userLabel}'s personal AI assistant.
Today's date is ${todayString()}.
${userName ? `Address the user as "${userName}" — use their name naturally in conversation, not robotically after every sentence.` : 'If you learn the user\'s name during the conversation, use it naturally going forward.'}

Style: Direct, structured, high-density. No filler, no emojis, no motivational language.
Quantify wherever possible. Conservative estimates. Lead with the answer, then reasoning.
Do not narrate before calling tools — never say things like "Let me check that", "Let me grab that now", "One moment", etc. Call the tool directly and respond after.
When making sequential tool calls, always start each status update on a new line — never run status messages together without a line break.
When creating multiple calendar events, work one week at a time. After completing each week, stop and report what was created, then wait for the user to confirm before continuing to the next week. Never attempt to create more than 7 events in a single response.

You have access to the user's Supabase data, Gmail, and Google Calendar via tools. Use them when asked — do not tell the user you lack access to email or calendar. Never suggest these integrations aren't connected; they are.

Tools available:
- get_tasks: active/completed/archived tasks
- add_task: create a new task
- complete_task: mark a task done by ID
- get_habits_today: all active habits + today's completion status
- log_habit: mark a habit complete for a given date
- get_fitness_summary: recent body composition, workouts, recovery metrics
- get_profile: profile key/value store
- update_profile: upsert one or more profile keys — use for goals, preferences, and targets agreed upon in conversation. Always tell the user what you're about to write before calling this, then confirm what was saved. For known fitness/nutrition goals, use the canonical keys so they appear in the web UI: weight_goal_lbs, body_fat_goal_pct, weekly_workout_goal, weekly_active_cal_goal, calorie_goal, protein_goal, carbs_goal, fat_goal, fiber_goal. For other goals (sleep, study, etc.) use dot-notation: sleep.goal.hrs, study.goal.mins_per_day, etc.
- search_gmail: search Gmail with any query string, returns message IDs + metadata
- get_email_body: fetch and decode the full plain-text body of an email by message ID
- list_calendar_events: list events across all calendars for a date range (defaults to today); each event includes a calendarType field: "primary" (user's own events), "birthday" (auto-generated from contacts), "holiday" (subscription holiday calendars), "other" (shared/secondary). By default show only primary+other events; mention birthdays as reminders separately; omit holiday events unless the user asks. IMPORTANT: only report events that appear in the tool result — never infer or carry over events from conversation history
- create_calendar_event: create a Google Calendar event on the primary calendar
- get_recipes: search saved recipes by ingredient, name, or tag; omit query to return all
- log_meal: log a meal by type (breakfast/lunch/dinner/snack) with optional recipe link, notes, and estimated macros (calories, protein_g, carbs_g, fat_g) — include macros whenever the user mentions them or you can estimate from the food description

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
          .insert({ user_id: userId, title, priority: priority ?? null, category: category ?? null, due_date: due_date ?? null, status: "active" })
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
        let q = supabase
          .from("tasks")
          .update({ status: "completed", completed_at: new Date().toISOString() })
          .eq("id", id);
        if (userId) q = q.eq("user_id", userId);
        const { data, error } = await q.select("id, title, status, completed_at").single();
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
        let regQ = supabase.from("habit_registry").select("id, name, emoji, category").eq("active", true);
        let logQ = supabase.from("habits").select("habit_id, completed, notes").eq("date", targetDate);
        if (userId) { regQ = regQ.eq("user_id", userId); logQ = logQ.eq("user_id", userId); }
        const [registryResult, logsResult] = await Promise.all([regQ, logQ]);
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
        let habQ = supabase
          .from("habit_registry")
          .select("id, name")
          .ilike("name", `%${name}%`)
          .eq("active", true)
          .limit(1);
        if (userId) habQ = habQ.eq("user_id", userId);
        const { data: habits, error: lookupError } = await habQ;
        if (lookupError) return { error: lookupError.message };
        if (!habits || habits.length === 0) return { error: `No active habit matching "${name}" found.` };
        const habit = habits[0];
        const { data, error } = await supabase
          .from("habits")
          .upsert(
            { user_id: userId, habit_id: habit.id, date: targetDate, completed: true, notes: notes ?? null },
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

        let bodyQ = supabase
          .from("fitness_log")
          .select("date, weight_lb, body_fat_pct, bmi, muscle_mass_lb, visceral_fat, source")
          .not("body_fat_pct", "is", null)
          .order("date", { ascending: false })
          .limit(2);
        let workQ = supabase
          .from("workout_sessions")
          .select("date, activity, duration_mins, calories, avg_hr, notes")
          .gte("date", sinceStr)
          .order("date", { ascending: false });
        let recQ = supabase
          .from("recovery_metrics")
          .select("date, avg_hrv, resting_hr, sleep_score, readiness, source")
          .order("date", { ascending: false })
          .limit(1);
        if (userId) { bodyQ = bodyQ.eq("user_id", userId); workQ = workQ.eq("user_id", userId); recQ = recQ.eq("user_id", userId); }

        const [bodyCompResult, workoutsResult, recoveryResult] = await Promise.all([bodyQ, workQ, recQ]);

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
        let q = supabase.from("profile").select("key, value, updated_at").order("key", { ascending: true });
        if (userId) q = q.eq("user_id", userId);
        const { data, error } = await q;
        if (error) return { error: error.message };
        return data ?? [];
      },
    }),

    update_profile: tool({
      description:
        "Upsert one or more profile key/value pairs. Use when the user explicitly agrees to save a goal, preference, or personal target. " +
        "For known fitness/nutrition goals use the canonical flat keys (weight_goal_lbs, body_fat_goal_pct, weekly_workout_goal, " +
        "weekly_active_cal_goal, calorie_goal, protein_goal, carbs_goal, fat_goal, fiber_goal) so they surface in the web UI. " +
        "For other goals use dot-notation (sleep.goal.hrs, study.goal.mins_per_day, etc.). " +
        "Always tell the user what you are about to write before calling this tool, then confirm each key that was saved.",
      parameters: jsonSchema<{ updates: { key: string; value: string }[] }>({
        type: "object",
        required: ["updates"],
        properties: {
          updates: {
            type: "array",
            description: "Key/value pairs to upsert into the profile table.",
            items: {
              type: "object",
              required: ["key", "value"],
              properties: {
                key: { type: "string", description: "Profile key." },
                value: { type: "string", description: "Value to store (always a string)." },
              },
            },
          },
        },
      }),
      execute: async ({ updates }) => {
        const rows = updates.map(({ key, value }) => ({ key, value, ...(userId ? { user_id: userId } : {}) }));
        const { data, error } = await supabase
          .from("profile")
          .upsert(rows, { onConflict: "user_id,key" })
          .select("key, value, updated_at");
        if (error) return { error: error.message };
        return { written: data ?? [] };
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
        if (isDemo) {
          // Return mock emails filtered loosely by query keywords
          const q = query.toLowerCase();
          const mockEmails = DEMO_EMAILS.filter((e) =>
            !q || e.subject.toLowerCase().includes(q.split(" ")[0]) || q.includes("unread") || q.includes("subject:")
          ).slice(0, Math.min(max_results, 5));
          return { results: mockEmails };
        }
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
        if (isDemo) {
          const email = DEMO_EMAILS.find((e) => e.id === message_id);
          if (!email) return { error: "Email not found" };
          return { id: message_id, from: email.from, subject: email.subject, date: email.date, body: email.body ?? email.subject, truncated: false };
        }
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

          const isTruncated = body ? body.length > 4000 : false;
          const bodyText = body
            ? isTruncated
              ? body.slice(0, 4000) + `\n\n[...email truncated — ${body.length - 4000} more characters not shown]`
              : body
            : null;

          return {
            id: message_id,
            from: getHeader("From"),
            subject: getHeader("Subject"),
            date: getHeader("Date"),
            body: bodyText ?? "(No readable body found)",
            truncated: isTruncated,
          };
        } catch (err) {
          return { error: err instanceof Error ? err.message : "Failed to fetch email body" };
        }
      },
    }),

    list_calendar_events: tool({
      description:
        "List events across all Google Calendars for a given date range. Defaults to today only. Use this whenever the user asks what's on their calendar, schedule, or agenda.",
      parameters: jsonSchema<{ date?: string; days?: number }>({
        type: "object",
        properties: {
          date: {
            type: "string",
            description: "Start date in YYYY-MM-DD format. Defaults to today.",
          },
          days: {
            type: "number",
            description: "Number of days to include (1 = just the start date). Defaults to 1.",
          },
        },
      }),
      execute: async ({ date, days = 1 }) => {
        if (isDemo) {
          return { events: DEMO_CALENDAR_EVENTS, count: DEMO_CALENDAR_EVENTS.length };
        }
        try {
          const startDate = date ?? todayString();
          const endDate = addDays(startDate, Math.max(1, days) - 1);

          const auth = getGoogleAuthClient();
          const calendar = google.calendar({ version: "v3", auth });

          const calListRes = await calendar.calendarList.list({ minAccessRole: "reader" });
          const calendars = calListRes.data.items ?? [];

          const allEventArrays = await Promise.all(
            calendars.map(async (cal) => {
              const res = await calendar.events.list({
                calendarId: cal.id!,
                timeMin: startOfDayRFC3339(startDate),
                timeMax: endOfDayRFC3339(endDate),
                singleEvents: true,
                orderBy: "startTime",
                maxResults: 25,
              });
              const calName = cal.summaryOverride ?? cal.summary ?? cal.id ?? "Unknown";
              const calNameLower = calName.toLowerCase();
              const calendarType = cal.primary
                ? "primary"
                : calNameLower.includes("birthday") || calNameLower.includes("contact")
                ? "birthday"
                : calNameLower.includes("holiday")
                ? "holiday"
                : "other";

              return (res.data.items ?? [])
                .filter((e) => {
                  if (e.status === "cancelled") return false;
                  // Filter out events the user has declined
                  const selfAttendee = e.attendees?.find((a) => a.self);
                  if (selfAttendee?.responseStatus === "declined") return false;
                  return true;
                })
                .map((e) => ({
                  title: e.summary ?? "(No title)",
                  start: e.start?.dateTime ?? e.start?.date ?? "",
                  end: e.end?.dateTime ?? e.end?.date ?? "",
                  allDay: !e.start?.dateTime,
                  calendar: calName,
                  calendarType,
                  location: e.location ?? null,
                }));
            })
          );

          const events = allEventArrays
            .flat()
            .sort((a, b) => a.start.localeCompare(b.start));

          return { events, count: events.length };
        } catch (err) {
          return { error: err instanceof Error ? err.message : "Failed to list calendar events" };
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
        if (isDemo) {
          return { id: `demo-${Date.now()}`, title, start: { date, dateTime: start_time ? `${date}T${start_time}:00` : date }, end: { date, dateTime: end_time ? `${date}T${end_time}:00` : date }, note: "Demo mode — event not saved to real calendar." };
        }
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
        if (userId) req = req.eq("user_id", userId);
        if (query) {
          req = req.or(`name.ilike.%${query}%,ingredients.ilike.%${query}%`);
        }
        const { data, error } = await req.order("name");
        if (error) return { error: error.message };
        return data ?? [];
      },
    }),

    log_meal: tool({
      description: "Log a meal to the meal_log table. Include estimated macros (calories, protein_g, carbs_g, fat_g) whenever the user mentions them or you can estimate them from the food description.",
      parameters: jsonSchema<{
        meal_type: "breakfast" | "lunch" | "dinner" | "snack";
        notes?: string;
        recipe_id?: string;
        date?: string;
        calories?: number;
        protein_g?: number;
        carbs_g?: number;
        fat_g?: number;
      }>({
        type: "object",
        required: ["meal_type"],
        properties: {
          meal_type: { type: "string", enum: ["breakfast", "lunch", "dinner", "snack"], description: "Meal type." },
          notes: { type: "string", description: "Free-text meal description." },
          recipe_id: { type: "string", description: "UUID of a saved recipe." },
          date: { type: "string", description: "Date in YYYY-MM-DD format. Defaults to today." },
          calories: { type: "number", description: "Estimated calories." },
          protein_g: { type: "number", description: "Estimated protein in grams." },
          carbs_g: { type: "number", description: "Estimated carbohydrates in grams." },
          fat_g: { type: "number", description: "Estimated fat in grams." },
        },
      }),
      execute: async ({ meal_type, notes, recipe_id, date, calories, protein_g, carbs_g, fat_g }) => {
        const { data, error } = await supabase
          .from("meal_log")
          .insert({
            user_id: userId,
            meal_type,
            notes: notes ?? null,
            recipe_id: recipe_id ?? null,
            date: date ?? todayString(),
            calories: calories ?? null,
            protein_g: protein_g ?? null,
            carbs_g: carbs_g ?? null,
            fat_g: fat_g ?? null,
            source: "chat",
          })
          .select()
          .single();
        if (error) return { error: error.message };
        return data;
      },
    }),
  };

  // Select model: demo → Groq Llama (free tier); real user → Anthropic tier selection
  let selectedModel;
  if (isDemo) {
    const groq = createGroq({ apiKey: process.env.GROQ_API_KEY });
    selectedModel = groq("llama-3.3-70b-versatile");
    console.log(`[chat] model=groq/llama-3.3-70b-versatile (demo) session=${sessionId}`);
  } else {
    const modelTier = selectModel(messages);
    console.log(`[chat] model=${modelTier} session=${sessionId} msg="${messages[messages.length - 1]?.content?.toString().slice(0, 80)}"`);
    selectedModel = wrapLanguageModel({
      model: anthropic(modelTier === "haiku" ? "claude-haiku-4-5-20251001" : "claude-sonnet-4-6"),
      middleware: retryOnOverload,
    });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const streamOptions: Parameters<typeof streamText>[0] = {
    model: selectedModel as any,
    system: systemPrompt,
    messages: [...contextMessages, ...cleanMessages],
    tools,
    maxSteps: 25,
    onError: ({ error }) => {
      console.error("[chat] streamText error:", JSON.stringify(error));
    },
    onFinish: async ({ text }) => {
      if (!sessionId) return;
      if (!text.trim()) return; // Don't persist empty assistant responses (failed/tool-only steps)

      const lastUserMessage = messages[messages.length - 1];

      try {
        // Upsert the session — creates it if it doesn't exist yet (lazy session creation
        // for new chats whose UUID was generated client-side before any DB write).
        const { error: sessionError } = await supabase.from("chat_sessions").upsert(
          { id: sessionId, user_id: userId, device: "web", last_active_at: new Date().toISOString() },
          { onConflict: "id" }
        );
        if (sessionError) throw sessionError;

        const { error: insertError } = await supabase.from("chat_messages").insert([
          {
            session_id: sessionId,
            user_id: userId,
            role: "user",
            content: lastUserMessage.content,
          },
          {
            session_id: sessionId,
            user_id: userId,
            role: "assistant",
            content: text,
          },
        ]);
        if (insertError) throw insertError;
      } catch (err) {
        console.error("[chat] onFinish persist error:", err);
      }
    },
  };

  // Only pass Anthropic cache options for non-demo (Groq doesn't support providerOptions)
  if (!isDemo) {
    streamOptions.providerOptions = {
      anthropic: { cacheControl: { type: "ephemeral" } },
    };
  }

  const result = streamText(streamOptions);

  return result.toDataStreamResponse();
}
