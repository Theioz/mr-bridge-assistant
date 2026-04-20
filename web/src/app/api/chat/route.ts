import { anthropic } from "@ai-sdk/anthropic";
import { createGroq } from "@ai-sdk/groq";
import { todayString } from "@/lib/timezone";
import { ToolLoopAgent, wrapLanguageModel, stepCountIs, convertToModelMessages } from "ai";
import type { StopCondition, ToolSet, UIMessage, ModelMessage } from "ai";
import type { LanguageModelV3Middleware } from "@ai-sdk/provider";
import { createServiceClient } from "@/lib/supabase/service";
import { createClient } from "@/lib/supabase/server";
import type { ToolContext } from "@/lib/tools/_context";
import { buildTasksTools } from "@/lib/tools/tasks";
import { buildHabitsTools } from "@/lib/tools/habits";
import { buildFitnessTools } from "@/lib/tools/fitness";
import { buildProfileTools } from "@/lib/tools/profile";
import { buildGmailTools } from "@/lib/tools/gmail";
import { buildCalendarTools } from "@/lib/tools/calendar";
import { buildMealsTools } from "@/lib/tools/meals";
import { buildSessionTools } from "@/lib/tools/session";
import { buildWorkoutTools } from "@/lib/tools/workouts";
import { buildStocksTools } from "@/lib/tools/stocks";
import { buildSportsTools } from "@/lib/tools/sports";

const retryOnOverload: LanguageModelV3Middleware = {
  specificationVersion: "v3",
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

/** Concatenate all text parts of a UIMessage into a single string.
 * Used for the denormalized `content` snapshot the sidebar preview reads,
 * for the dedup guard, for selectModel's heuristics, and for logging. */
function extractTextFromParts(message: UIMessage): string {
  return message.parts
    .filter((p): p is { type: "text"; text: string } => p.type === "text")
    .map((p) => p.text)
    .join("");
}

function selectModel(messages: UIMessage[], modelOverride?: "haiku" | "sonnet" | "auto"): "haiku" | "sonnet" {
  if (modelOverride === "haiku") return "haiku";
  if (modelOverride === "sonnet") return "sonnet";

  const lastUser = [...messages].reverse().find((m) => m.role === "user");
  if (!lastUser) return "sonnet";
  const msg = extractTextFromParts(lastUser).toLowerCase().trim();
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
    /what.{0,20}(eat|ate|had).{0,20}today/,
    /today.{0,20}meals/,
    /what.{0,20}weight.{0,20}goal/,
    /what.{0,20}(protein|calorie|macro).{0,20}goal/,
    /show.{0,10}habits/,
    /how.{0,20}habits.{0,20}(today|this week)/,
    /what.{0,10}my.{0,20}goal/,
    /get.{0,10}profile/,
    /log.{0,10}(that|it) as/,
  ];
  if (simplePatterns.some((p) => p.test(msg))) return "haiku";

  return "sonnet";
}

// ── Static system prompt (module-level, never changes — safe to cache) ──────
// The dynamic block (date + user name) is built inside POST per-request.
// Only the static block carries cacheControl so the cache key is stable
// across users and days; the tiny dynamic block is processed fresh each turn.
const STATIC_SYSTEM_PROMPT = `Style: Direct, structured, high-density. No filler, no emojis, no motivational language.
Quantify wherever possible. Conservative estimates. Lead with the answer, then reasoning.
Do not narrate before calling tools — never say things like "Let me check that", "Let me grab that now", "One moment", etc. Call the tool directly and respond after.
When making sequential tool calls, always start each status update on a new line — never run status messages together without a line break.
When creating multiple calendar events, work one week at a time. After completing each week, stop and report what was created, then wait for the user to confirm before continuing to the next week. Never attempt to create more than 7 events in a single response.
If a task will require more than 20 sequential tool calls, stop before hitting the limit, summarize what you've done so far, and ask the user to break the remaining work into smaller requests. Never let the step limit cut you off silently mid-task.
Before calling get_session_history, ask the user: "Should I pull earlier messages from this session for more context?" Only call the tool if they confirm.

Verified-success rule: Every state-mutating tool returns either { ok: true, ... } or { ok: false, error }. Never say a mutating action is "done" or use ✓ unless the most recent tool result for that action has ok: true in this turn. If you don't see a successful tool result, either run the tool now or tell the user the action didn't go through (with the error if you have one). Do not infer success from the user's confirmation alone or from the absence of a visible failure.

Calendar pre-flight rules (apply before every create_calendar_event or assign_workout call):
1. Call list_calendar_events for the target date. Check for time overlaps with the proposed event. If any overlap exists, surface it to the user and ask how to proceed — never silently double-book.
2. Check the same result for an event with a matching title (case-insensitive). If a duplicate title exists on that date, show it and ask whether to create another, update the existing one, or skip.
3. Only call create_calendar_event or assign_workout after the user has confirmed there are no conflicts or has explicitly accepted them.

Calendar mutation rules:
- delete_calendar_event: always state the event title, date, and time; require explicit user confirmation before calling.
- update_calendar_event: always state the before/after diff; require explicit user confirmation before calling.

You have access to the user's Supabase data, Gmail, and Google Calendar via tools. Use them when asked — do not tell the user you lack access to email or calendar. Never suggest these integrations aren't connected; they are.

Tools available:
- get_tasks: active/completed/archived tasks
- add_task: create a new task or subtask (use parent_id to add items to a list — call get_tasks first to find the parent task ID)
- complete_task: mark a task done by ID
- get_habits_today: all active habits + today's completion status
- log_habit: mark a habit complete for a given date
- get_fitness_summary: recent body composition, workouts, recovery metrics
- get_profile: profile key/value store
- update_profile: upsert one or more profile keys — use for goals, preferences, and targets agreed upon in conversation. Always tell the user what you're about to write before calling this, then confirm what was saved. For known fitness/nutrition goals, use the canonical keys so they appear in the web UI: weight_goal_lbs, body_fat_goal_pct, weekly_workout_goal, weekly_active_cal_goal, calorie_goal, protein_goal, carbs_goal, fat_goal, fiber_goal. For other goals (sleep, study, etc.) use dot-notation: sleep.goal.hrs, study.goal.mins_per_day, etc.
- search_gmail: search Gmail with any query string, returns message IDs + metadata
- get_email_body: fetch and decode the full plain-text body of an email by message ID
- list_calendar_events: list events across all calendars for a date range (defaults to today); each event includes a calendarType field: "primary" (user's own events), "birthday" (auto-generated from contacts), "holiday" (subscription holiday calendars), "other" (shared/secondary). Each event also includes an eventId — preserve it for delete/update calls. By default show only primary+other events; mention birthdays as reminders separately; omit holiday events unless the user asks. IMPORTANT: only report events that appear in the tool result — never infer or carry over events from conversation history
- create_calendar_event: create a Google Calendar event on the primary calendar. Pre-flight required: call list_calendar_events first, check for time overlaps and duplicate titles on the target date, surface any conflicts to the user, and confirm before proceeding.
- delete_calendar_event: delete an event by eventId. Always state title/date/time and require explicit user confirmation first.
- update_calendar_event: patch an existing event by eventId (summary, start, end, location, description). Always state before/after and require explicit user confirmation first.
- get_recipes: search the saved recipe library by ingredient, name, or tag; omit query to return all saved recipes. Use this as one input alongside your own recipe knowledge — do not limit suggestions to saved recipes only.
- get_today_meals: get all meals logged today. Call this before making any claim about what the user has or hasn't eaten today.
- get_session_history: fetch earlier messages from this chat session. Ask the user before calling: "Should I pull earlier messages from this session for more context?"
- get_workout_plan: fetch this week's workout plan (Mon–Sun). Call before making any suggestion or edit to the program.
- assign_workout: upsert one day's workout plan to Supabase and create/update the Google Calendar event. Pre-flight required: call list_calendar_events first, check for overlaps and duplicate Workout titles on that date, surface conflicts to the user, and confirm before proceeding.
- update_workout_exercise: patch a single exercise within a day's plan by name (case-insensitive) and refresh the calendar event description.
- get_workout_history: fetch logged strength-session performance (actual sets/reps/weights/RPE/notes). Filter by exercise_name (case-insensitive partial match) and/or days back (default 30). Weights are returned in kg canonically — include the user's weight_unit from get_profile when reporting numbers.

Progression heuristics (apply when the user asks for planning/adjustment — always call get_workout_history first):
1. If the last 2 sessions for an exercise hit top-of-range reps at the prescribed weight, suggest +2.5 kg upper-body / +5 kg lower-body for the next session.
2. If RPE ≥ 9 on working sets for 2+ consecutive sessions, hold the weight (do not add).
3. If the user missed target reps 2 sessions in a row for the same exercise, suggest a 10% deload.
4. If an exercise hasn't progressed (top weight × reps flat or lower) across 4+ sessions, suggest a variation swap.
Always surface the evidence ("last 3 bench sessions: 135×8, 135×8, 135×9 — hit top of range twice, ready to go to 137.5") before making the recommendation. The user may override any suggestion.

Recipes and meal planning are in scope.

Meal logging is done through the Meals tab in the web interface — do not attempt to log meals yourself. If the user asks you to log a meal, tell them to use the Meals tab. You can still read today's logged meals via get_today_meals to give accurate nutrition advice.
Before making any claim about what the user has or hasn't eaten today, always call get_today_meals first.

Ingredient assumptions: Unless the user states otherwise in this conversation, assume the only ingredients available are bare essentials — salt, pepper, neutral oil, olive oil, butter, garlic, onion, basic dry spices (cumin, paprika, oregano, chili flake, cinnamon, etc.), flour, sugar, baking soda/powder, vinegar, soy sauce, and stock/broth. Do not assume proteins, produce, dairy, or specialty ingredients are on hand.

When the user says what they have available (e.g. "I have chicken, broccoli, and rice"), treat those ingredients as the primary constraint for the rest of the conversation.

When asked what to cook or for recipe ideas:
1. Call get_recipes to check the saved recipe library — if a saved recipe is a good fit for the context (ingredients on hand, dietary preferences, fitness goals), surface it with a note that it's saved.
2. Also suggest 1–2 recipes from your own knowledge that are NOT in the saved list. The saved list is a library of recipes the user likes, not a menu to be confined to.
3. If the user hasn't said what they have on hand, ask: "What proteins or produce do you have available?"
4. Call get_fitness_summary to calibrate the recommendation — prioritize protein post-workout, lower-calorie options in a deficit phase, etc.
5. Call get_profile to check for dietary preferences and cuisine preferences (ignore any pantry-related profile keys).
6. Always provide at least one concrete, actionable recipe recommendation. Include estimated calories, protein, carbs, and fat. Flag if the meal is a poor nutritional fit for current fitness context.`;

// Lambda runtime ceiling. A wall-clock timer trips turnAbort at TURN_DEADLINE_MS
// so onFinish always runs and persists a fallback assistant message before
// Vercel's hard kill — the silent-stall path #319 hit when the previous 60s
// ceiling let the Lambda die mid-stream.
export const maxDuration = 90;
const TURN_DEADLINE_MS = 80_000;

// Issue #223 + #319: when the agent loop ends without an assistant text
// message (step-cap stopWhen, token-budget stopWhen, Vercel-timeout abort, or
// a quiet model), build a short human-readable summary from the tool calls
// that did execute so the user sees acknowledgement instead of silence — and
// CRUCIALLY, distinguish ok-true from ok-false tool results so we never
// claim success for an action that failed.
const TOOL_PHRASING: Record<string, [success: string, attempt: string]> = {
  add_task: ["added a task", "add a task"],
  complete_task: ["marked a task complete", "mark a task complete"],
  log_habit: ["logged a habit", "log a habit"],
  update_profile: ["updated your profile", "update your profile"],
  create_calendar_event: ["created a calendar event", "create a calendar event"],
  update_calendar_event: ["updated a calendar event", "update a calendar event"],
  delete_calendar_event: ["deleted a calendar event", "delete a calendar event"],
  assign_workout: ["assigned a workout", "assign a workout"],
  update_workout_exercise: ["updated a workout exercise", "update a workout exercise"],
};

interface CompletedToolStep {
  toolName: string;
  ok: boolean;
  error?: string;
}

function isToolResultOk(result: unknown): boolean {
  // Mutating tools: explicit { ok: true | false }
  if (result && typeof result === "object" && "ok" in result) {
    return (result as { ok: boolean }).ok === true;
  }
  // Read-only tools: anything without an `error` key counts as ok for the
  // purposes of "did this complete?"
  if (result && typeof result === "object" && "error" in result) return false;
  return true;
}

function synthesizeFallbackSummary(
  steps: CompletedToolStep[],
  flags: { hitStepCap: boolean; budgetExceeded: boolean; aborted: boolean }
): string {
  const succeeded = steps.filter((s) => s.ok && TOOL_PHRASING[s.toolName]);
  const failed = steps.filter((s) => !s.ok && TOOL_PHRASING[s.toolName]);

  const phraseList = (subset: CompletedToolStep[], idx: 0 | 1): string => {
    const counts = new Map<string, number>();
    for (const s of subset) counts.set(s.toolName, (counts.get(s.toolName) ?? 0) + 1);
    const out: string[] = [];
    for (const [name, n] of counts) {
      const phrase = TOOL_PHRASING[name][idx];
      out.push(n > 1 ? `${phrase} (×${n})` : phrase);
    }
    return out.join(", ");
  };

  let body: string;
  if (failed.length === 0 && succeeded.length === 0) {
    body = "I hit a snag generating a response — please try again.";
  } else if (failed.length === 0) {
    body = `Done. I ${phraseList(succeeded, 0)}.`;
  } else if (succeeded.length === 0) {
    const firstError = failed.find((f) => f.error)?.error;
    body = `I tried to ${phraseList(failed, 1)} but it didn't go through${firstError ? ` — ${firstError}` : ""}. Please try again.`;
  } else {
    const firstError = failed.find((f) => f.error)?.error;
    body =
      `Partial: I ${phraseList(succeeded, 0)}, but failed to ${phraseList(failed, 1)}` +
      `${firstError ? ` (${firstError})` : ""}. Check before retrying the failed parts.`;
  }

  const reason = flags.aborted
    ? " (I ran out of time before I could finish a full summary — your request may or may not have completed; check before retrying.)"
    : flags.budgetExceeded
      ? " (Hit my token budget before I could write a longer summary — let me know if you need detail.)"
      : flags.hitStepCap
        ? " (Hit my step limit before I could write a longer summary — let me know if you need detail.)"
        : "";
  return body + reason;
}

// Stop the tool loop when cumulative token usage across steps exceeds `budget`.
// v6 `stopWhen` accepts an array of predicates composed with OR, so this pairs
// with `stepCountIs` to replace the v4-era hand-rolled cumulativeTokens tally.
//
// Note on prompt caching (#340): usage.inputTokens is the grand total of input
// tokens processed by the model, including cache reads and writes. The budget
// ceiling intentionally protects against runaway context growth, not cost —
// cached reads still count here even though they're billed at ~10%. Do not
// subtract cacheReadTokens from this tally.
// Generic over TOOLS so the predicate composes with a concrete, typed tools
// object in ToolLoopAgent's `stopWhen` (which uses `NoInfer<TOOLS>`). The
// SDK's own helpers (e.g. `stepCountIs`) return `StopCondition<any>` for the
// same reason; we parametrize instead to keep `--no-explicit-any` clean.
const tokenBudgetExceeds =
  <T extends ToolSet>(budget: number): StopCondition<T> =>
  ({ steps }) => {
    let total = 0;
    for (const s of steps) {
      total += (s.usage?.inputTokens ?? 0) + (s.usage?.outputTokens ?? 0);
    }
    return total > budget;
  };

// Attach an Anthropic ephemeral cache breakpoint to the last entry in a tools
// object. Anthropic caps requests at 4 cache breakpoints total — anchoring one
// marker on the trailing tool caches every tool above it and leaves headroom
// for the system-prompt marker (#340). Non-Anthropic providers ignore the
// provider-scoped `anthropic` key so this is safe to pass through; callers
// should still skip the wrap on the demo path for clarity.
function withTrailingCacheBreakpoint<T extends Record<string, unknown>>(tools: T): T {
  const keys = Object.keys(tools);
  if (keys.length === 0) return tools;
  const lastKey = keys[keys.length - 1];
  const last = tools[lastKey] as {
    providerOptions?: { anthropic?: Record<string, unknown> } & Record<string, unknown>;
  } & Record<string, unknown>;
  const nextLast = {
    ...last,
    providerOptions: {
      ...(last.providerOptions ?? {}),
      anthropic: {
        ...(last.providerOptions?.anthropic ?? {}),
        cacheControl: { type: "ephemeral" as const },
      },
    },
  };
  return { ...tools, [lastKey]: nextLast } as T;
}

export async function POST(req: Request) {
  const { messages, sessionId, model: modelOverride } = await req.json() as {
    messages: UIMessage[];
    sessionId?: string;
    model?: "haiku" | "sonnet" | "auto";
  };
  console.log("[chat] sessionId:", sessionId, "messages:", messages.length);

  // Resolve the authenticated user (needed for per-user data scoping)
  const serverClient = await createClient();
  const { data: { user } } = await serverClient.auth.getUser();
  if (!user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }
  const userId = user.id;
  const demoUserId = process.env.DEMO_USER_ID ?? null;
  const isDemo = !!(demoUserId && userId === demoUserId);

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

  // Load the last 10 messages from this session as context (#319: was loading
  // the FIRST 10 by ordering ascending then limiting — for any session past 10
  // turns the model lost recent context, including its own prior tool results).
  // Historical context stays text-only — the model needs flat strings from
  // history, and `content` is authoritative for that. Promoting historical
  // tool-result round-trips into the model is a separate follow-up.
  let contextModelMessages: ModelMessage[] = [];
  if (sessionId) {
    const { data } = await supabase
      .from("chat_messages")
      .select("role, content, position")
      .eq("session_id", sessionId)
      .in("role", ["user", "assistant"])
      .order("position", { ascending: false, nullsFirst: false })
      .limit(10);
    if (data) {
      // Filter out empty-content messages — they cause Anthropic 400 errors —
      // then reverse so messages flow oldest→newest into the model.
      contextModelMessages = (data as { role: "user" | "assistant"; content: string }[])
        .filter((m) => m.content.trim() !== "")
        .reverse()
        .map((m) => ({ role: m.role, content: m.content })) as ModelMessage[];
    }
  }

  // Persist the session and user message immediately — before streaming starts.
  // This ensures messages survive stream errors, timeouts, or aborts (fix for issue #132).
  const lastUserMessage = messages[messages.length - 1];
  const userMessageContent = lastUserMessage ? extractTextFromParts(lastUserMessage) : "";

  if (sessionId && userId && userMessageContent.trim()) {
    try {
      // Upsert the session — creates it if it doesn't exist yet (lazy session creation
      // for new chats whose UUID was generated client-side before any DB write).
      await supabase.from("chat_sessions").upsert(
        { id: sessionId, user_id: userId, device: "web", last_active_at: new Date().toISOString() },
        { onConflict: "id" }
      );

      // Dedup guard: skip insert if an identical user message was persisted in the
      // last 10 seconds (handles retries — same message re-POSTed after a stream error).
      const { data: recent } = await supabase
        .from("chat_messages")
        .select("id")
        .eq("session_id", sessionId)
        .eq("role", "user")
        .eq("content", userMessageContent)
        .gte("created_at", new Date(Date.now() - 10_000).toISOString())
        .limit(1)
        .maybeSingle();

      if (!recent) {
        // Derive next position: MAX(position) + 1 within this session.
        const { data: posRow } = await supabase
          .from("chat_messages")
          .select("position")
          .eq("session_id", sessionId)
          .order("position", { ascending: false, nullsFirst: false })
          .limit(1)
          .maybeSingle();
        const nextPos = ((posRow?.position as number | null) ?? 0) + 1;

        await supabase.from("chat_messages").insert({
          session_id: sessionId,
          user_id: userId,
          role: "user",
          content: userMessageContent,
          parts: lastUserMessage?.parts ?? [{ type: "text", text: userMessageContent }],
          position: nextPos,
        });
      }
    } catch (err) {
      // Non-fatal — stream proceeds regardless; worst case the message is missing on refresh
      console.error("[chat] early user message persist error:", err);
    }
  }

  const userLabel = userName ?? (isDemo ? "Demo User" : "the user");

  // Demo: full string prompt (Groq doesn't support cacheControl).
  // Non-demo: dynamic block only — the static rules live in STATIC_SYSTEM_PROMPT above.
  const demoSystemPrompt = `You are Mr. Bridge, a personal AI assistant. Today's date is ${todayString()}.
You are currently running in demo mode for a fictional persona: Demo User, a software engineer based in San Francisco.
Address the user as "Demo User" — naturally in conversation, not robotically after every sentence.

Style: Direct, structured, high-density. No filler, no emojis, no motivational language.
Quantify wherever possible. Conservative estimates. Lead with the answer, then reasoning.
Do not narrate before calling tools. Call the tool directly and respond after.

This is a demo account with realistic but fictional data. All data changes are reset nightly.
You have access to Demo User's demo data via tools: tasks, habits, fitness, recovery, profile, recipes, meal log, Gmail (simulated), and Calendar (simulated).

Tools available:
- get_tasks, add_task, complete_task
- get_habits_today, log_habit
- get_fitness_summary
- get_profile, update_profile
- search_gmail, get_email_body (returns demo emails)
- list_calendar_events, create_calendar_event, delete_calendar_event, update_calendar_event (demo mode — no real changes)
- get_recipes, get_today_meals
- get_workout_plan, assign_workout, update_workout_exercise, get_workout_history`;

  const dynamicPromptBlock = `You are Mr. Bridge, ${userLabel}'s personal AI assistant.
Today's date is ${todayString()}.
${userName ? `Address the user as "${userName}" — use their name naturally in conversation, not robotically after every sentence.` : "If you learn the user's name during the conversation, use it naturally going forward."}`;

  // #342: convert structured UIMessage[] (with tool-call / tool-result / file
  // parts) into ModelMessage[] for the agent. The SDK already drops empty
  // text parts, so the legacy empty-content filter is no longer needed.
  const incomingModelMessages = await convertToModelMessages(messages);

  const toolContext: ToolContext = { supabase, userId, isDemo, sessionId };
  const baseTools = {
    ...buildTasksTools(toolContext),
    ...buildHabitsTools(toolContext),
    ...buildFitnessTools(toolContext),
    ...buildProfileTools(toolContext),
    ...buildGmailTools(toolContext),
    ...buildCalendarTools(toolContext),
    ...buildMealsTools(toolContext),
    ...buildSessionTools(toolContext),
    ...buildWorkoutTools(toolContext),
    ...buildStocksTools(toolContext),
    ...buildSportsTools(toolContext),
  };
  // #340: Anthropic ephemeral cache breakpoint on the trailing tool (caches
  // all 23 tool schemas above it). Skip on the demo path — Groq doesn't
  // support prompt caching.
  const tools = isDemo ? baseTools : withTrailingCacheBreakpoint(baseTools);

  // Select model: demo → Groq Llama (free tier); real user → Anthropic tier selection
  let selectedModel;
  let modelTier: "haiku" | "sonnet" | null = null;
  if (isDemo) {
    const groq = createGroq({ apiKey: process.env.GROQ_API_KEY });
    selectedModel = groq("llama-3.3-70b-versatile");
    console.log(`[chat] model=groq/llama-3.3-70b-versatile (demo) session=${sessionId}`);
  } else {
    modelTier = selectModel(messages, modelOverride);
    const lastMsg = messages[messages.length - 1];
    const lastMsgPreview = lastMsg ? extractTextFromParts(lastMsg).slice(0, 80) : "";
    console.log(`[chat] model=${modelTier} session=${sessionId} msg="${lastMsgPreview}"`);
    selectedModel = wrapLanguageModel({
      model: anthropic(modelTier === "haiku" ? "claude-haiku-4-5-20251001" : "claude-sonnet-4-6"),
      middleware: retryOnOverload,
    });
  }

  // #339: Anthropic extended thinking on the Sonnet path, behind ENABLE_THINKING
  // for an A/B measurement run (see PR description). Adaptive mode per the
  // @ai-sdk/anthropic docs: "For newer models (claude-sonnet-4-6, claude-opus-4-6,
  // and later), use adaptive thinking" — the model decides per-turn whether
  // reasoning is warranted. Reasoning is session-only — sendReasoning:false on
  // the stream response keeps reasoning bytes off the wire, and the #319
  // synthesizer only consumes `text`+steps. Anthropic counts reasoning as output
  // tokens, so TOKEN_BUDGET enforcement covers them automatically; the SDK does
  // NOT break out reasoning into outputTokens.reasoning (always undefined for
  // the Anthropic provider — see convert-anthropic-messages-usage.ts), so we
  // measure thinking impact via outputTokens + durationMs deltas.
  const thinkingEnabled =
    modelTier === "sonnet" && process.env.ENABLE_THINKING === "1";

  // System prompt shape (#340). Demo path stays a plain string for Groq.
  // Real-user path splits into two system messages: the static prefix carries
  // an Anthropic ephemeral cacheControl marker so its ~1.4k tokens + tool
  // schemas above it are cached (~5 min TTL); the dynamic block (date + name)
  // follows uncached so cache hits don't invalidate each turn.
  const systemValue: string | Array<{
    role: "system";
    content: string;
    providerOptions?: { anthropic?: { cacheControl: { type: "ephemeral" } } };
  }> = isDemo
    ? demoSystemPrompt
    : [
        {
          role: "system",
          content: STATIC_SYSTEM_PROMPT,
          providerOptions: { anthropic: { cacheControl: { type: "ephemeral" } } },
        },
        {
          role: "system",
          content: dynamicPromptBlock,
        },
      ];

  // Per-turn safeguards (issues #223 + #319): raise step cap from 12→20 so
  // multi-step calendar/task flows can finish their summary, bound cost with a
  // token budget, and bound wall-time with TURN_DEADLINE_MS so onFinish ALWAYS
  // runs before Vercel's maxDuration kill — the silent-stall path #319 hit
  // when the Lambda died mid-stream and onFinish never persisted the fallback.
  const MAX_STEPS = 20;
  const TOKEN_BUDGET = 150_000;
  const turnStartedAt = Date.now();
  let deadlineExceeded = false;
  const turnAbort = new AbortController();
  const deadlineTimer = setTimeout(() => {
    deadlineExceeded = true;
    console.warn(`[chat] turn deadline exceeded session=${sessionId} ms=${TURN_DEADLINE_MS} — aborting turn so onFinish can run`);
    turnAbort.abort();
  }, TURN_DEADLINE_MS);

  // Turn-complete sentinel state (#319) — hoisted so toUIMessageStreamResponse's
  // messageMetadata callback can emit them as metadata on the assistant message.
  // v5 replaced StreamData's side-channel with per-message metadata.
  let synthesized = false;
  let hadFailures = false;
  // #342: stash the canonical text-to-persist (from agent.onFinish) so the
  // outer toUIMessageStreamResponse.onFinish can write it alongside the
  // structured `parts` it receives from the SDK as `responseMessage.parts`.
  let contentToPersist = "";

  const agent = new ToolLoopAgent({
    model: selectedModel,
    instructions: systemValue,
    tools,
    ...(thinkingEnabled && {
      providerOptions: {
        anthropic: { thinking: { type: "adaptive" } },
      },
    }),
    stopWhen: [stepCountIs(MAX_STEPS), tokenBudgetExceeds(TOKEN_BUDGET)],
    // Per-request tool factories already close over { supabase, userId,
    // isDemo, sessionId } via `toolContext` above; prepareCall runs per
    // invoke so future callers could swap tools at call time without
    // reconstructing the agent. Passthrough today satisfies #350's contract
    // that tools wire through prepareCall.
    prepareCall: async (args) => args,
    onFinish: async ({ text, steps, finishReason, totalUsage, warnings }) => {
      clearTimeout(deadlineTimer);

      const stepCount = steps?.length ?? 0;
      const hitStepCap = stepCount >= MAX_STEPS;
      const cumulativeTokens = (steps ?? []).reduce(
        (acc, s) => acc + (s.usage?.inputTokens ?? 0) + (s.usage?.outputTokens ?? 0),
        0,
      );
      const budgetExceeded = cumulativeTokens > TOKEN_BUDGET;
      const durationMs = Date.now() - turnStartedAt;

      // #340 prompt-cache accounting. Sum across steps because totalUsage
      // aggregation of inputTokenDetails is provider-dependent; stepping
      // manually matches what the SDK's telemetry does and is robust to
      // null-filled detail objects on non-Anthropic providers (Groq).
      let cacheReadTokens = 0;
      let cacheWriteTokens = 0;
      let noCacheTokens = 0;
      // #339: count reasoning blocks + total reasoning text length per turn.
      // The Anthropic SDK does NOT populate outputTokens.reasoning (always
      // undefined — see convert-anthropic-messages-usage.ts), so usage-based
      // accounting can't tell us whether thinking fired. StepResult.reasoning
      // and StepResult.reasoningText DO carry the actual reasoning content,
      // which is the only definitive signal. Chars are a proxy for token
      // volume since reasoning gets bundled into outputTokens at billing time.
      let reasoningParts = 0;
      let reasoningChars = 0;
      for (const s of steps ?? []) {
        cacheReadTokens += s.usage?.inputTokenDetails?.cacheReadTokens ?? 0;
        cacheWriteTokens += s.usage?.inputTokenDetails?.cacheWriteTokens ?? 0;
        noCacheTokens += s.usage?.inputTokenDetails?.noCacheTokens ?? 0;
        reasoningParts += s.reasoning?.length ?? 0;
        reasoningChars += s.reasoningText?.length ?? 0;
      }
      const stepWarnings = (steps ?? []).flatMap((s) => s.warnings ?? []);
      const allWarnings = [...(warnings ?? []), ...stepWarnings];

      // Pair up tool calls with their results so the synthesizer can tell
      // "tool ran and succeeded" from "tool ran and failed" — the bug #319
      // fix for the synthesizer claiming success from toolCalls alone.
      const completedSteps: CompletedToolStep[] = [];
      const allCalls = (steps ?? []).flatMap((s) => s.toolCalls ?? []);
      const allResults = (steps ?? []).flatMap((s) => s.toolResults ?? []);
      const resultByCallId = new Map<string, unknown>();
      for (const r of allResults) {
        const callId = (r as { toolCallId?: string }).toolCallId;
        // v5 renamed tool result payload: .result → .output
        if (callId) resultByCallId.set(callId, (r as { output?: unknown }).output);
      }
      for (const call of allCalls) {
        const result = resultByCallId.get(call.toolCallId);
        const stepOk = result === undefined ? false : isToolResultOk(result);
        const stepError = result && typeof result === "object" && "error" in result
          ? String((result as { error?: unknown }).error)
          : undefined;
        completedSteps.push({ toolName: call.toolName, ok: stepOk, error: stepError });
      }
      const failedToolCount = completedSteps.filter((s) => !s.ok).length;
      hadFailures = failedToolCount > 0;

      // Determine what to persist. Three cases:
      //   1. Model produced text → persist as-is (normal path).
      //   2. Empty text + tool calls ran → synthesize from steps + results.
      //   3. Empty text + nothing ran → persist a visible error so the user
      //      isn't left in silence.
      // #342: assigns the closure-level `contentToPersist` so the outer
      // toUIMessageStreamResponse.onFinish (which holds responseMessage.parts)
      // writes both columns in one insert.
      contentToPersist = text.trim();
      if (!contentToPersist) {
        contentToPersist = synthesizeFallbackSummary(completedSteps, {
          hitStepCap,
          budgetExceeded,
          aborted: deadlineExceeded,
        });
        synthesized = true;
      }

      console.log(
        `[chat] turn complete session=${sessionId} steps=${stepCount}/${MAX_STEPS} ` +
        `tokens=${cumulativeTokens} durationMs=${durationMs} finishReason=${finishReason} ` +
        `hitStepCap=${hitStepCap} budgetExceeded=${budgetExceeded} deadlineExceeded=${deadlineExceeded} ` +
        `synthesized=${synthesized} toolFailures=${failedToolCount}/${completedSteps.length}`
      );

      // #340: structured per-turn cache-usage log. `isDemo` on Groq reports no
      // cache details; warnings surface any Anthropic wire-limit issue (e.g.
      // "cacheControl breakpoint limit") so silent degradation doesn't hide.
      console.log(
        `[chat] cache session=${sessionId} isDemo=${isDemo} ` +
        `inputTokens=${totalUsage?.inputTokens ?? 0} outputTokens=${totalUsage?.outputTokens ?? 0} ` +
        `cacheRead=${cacheReadTokens} cacheWrite=${cacheWriteTokens} noCache=${noCacheTokens} ` +
        `reasoningParts=${reasoningParts} reasoningChars=${reasoningChars} thinkingEnabled=${thinkingEnabled} ` +
        `warnings=${allWarnings.length === 0 ? "[]" : JSON.stringify(allWarnings)}`
      );

      // #342: assistant-message persistence moved to
      // toUIMessageStreamResponse.onFinish so we can write both `content`
      // (preview snapshot — this string) and `parts` (structured assistant
      // message from the SDK).
    },
  });

  const result = await agent.stream({
    messages: [...contextModelMessages, ...incomingModelMessages],
    abortSignal: turnAbort.signal,
  });

  // v5: emit the turn-complete sentinel (#319) as message metadata stamped on
  // the finish part. Client reads message.metadata.turnComplete to distinguish
  // a clean turn end from a Lambda kill mid-stream.
  return result.toUIMessageStreamResponse({
    // #342: pass the incoming UIMessages so the SDK runs in persistence mode
    // and stamps a stable id on the response message; `responseMessage.parts`
    // arriving in onFinish below is the canonical structured assistant
    // message we persist.
    originalMessages: messages,
    // #339: backend-only — even if thinking is enabled, reasoning parts must
    // not cross the wire. Defaults to true otherwise.
    sendReasoning: false,
    messageMetadata: ({ part }) => {
      if (part.type === "finish") {
        return {
          turnComplete: { synthesized, hadFailures, deadlineExceeded },
        };
      }
    },
    onFinish: async ({ responseMessage }) => {
      if (!sessionId || !userId) return;
      try {
        // Update session last_active_at to reflect completed turn.
        await supabase.from("chat_sessions").upsert(
          { id: sessionId, user_id: userId, device: "web", last_active_at: new Date().toISOString() },
          { onConflict: "id" }
        );

        // Derive next position so the assistant message sorts after the user message.
        const { data: posRow } = await supabase
          .from("chat_messages")
          .select("position")
          .eq("session_id", sessionId)
          .order("position", { ascending: false, nullsFirst: false })
          .limit(1)
          .maybeSingle();
        const nextPos = ((posRow?.position as number | null) ?? 0) + 1;

        // #342: dual-write — `content` is the preview snapshot (text or #319
        // synthesized fallback); `parts` is the structured assistant message
        // for round-trip rendering. Reasoning parts are stripped — #339 owns
        // reasoning persistence; this PR keeps it ephemeral, matching the
        // sendReasoning:false posture above.
        const partsToPersist = responseMessage.parts.filter(
          (p) => p.type !== "reasoning"
        );

        const { error: insertError } = await supabase.from("chat_messages").insert({
          session_id: sessionId,
          user_id: userId,
          role: "assistant",
          content: contentToPersist,
          parts: partsToPersist,
          position: nextPos,
        });
        if (insertError) throw insertError;
      } catch (persistErr) {
        console.error("[chat] onFinish persist error:", persistErr);
      }
    },
    onError: (error) => {
      console.error("[chat] stream error:", JSON.stringify(error));
      return "An error occurred.";
    },
  });
}
