import { NextResponse } from "next/server";
import { anthropic } from "@ai-sdk/anthropic";
import { generateText } from "ai";
import { google } from "googleapis";
import { createServiceClient } from "@/lib/supabase/service";
import { getGoogleAuthClient } from "@/lib/google-auth";

export const maxDuration = 60;

const APP_URL = process.env.APP_URL ?? "https://mr-bridge-assistant.vercel.app";
const CRON_SECRET = process.env.CRON_SECRET;
const TZ = process.env.USER_TIMEZONE ?? "America/Los_Angeles";
const DEFAULT_WORKOUT_TIME = "16:00";
const DEFAULT_WORKOUT_END = "17:00";

interface WorkoutExercise {
  exercise: string;
  sets?: number;
  reps?: string;
  description?: string;
  tips?: string[];
}

interface WorkoutDay {
  date: string;
  name?: string;
  warmup?: WorkoutExercise[];
  workout?: WorkoutExercise[];
  cooldown?: WorkoutExercise[];
  notes?: string;
}

interface MealPrepTask {
  title?: string;
  priority?: string;
  due_date?: string;
  category?: string;
  metadata?: Record<string, unknown>;
}

interface PlanPayload {
  workout_days?: WorkoutDay[];
  meal_prep_task?: MealPrepTask;
}

function checkAuth(req: Request): boolean {
  const auth = req.headers.get("authorization");
  return !!(CRON_SECRET && auth === `Bearer ${CRON_SECRET}`);
}

function buildCalendarDescription(
  warmup: WorkoutExercise[],
  workout: WorkoutExercise[],
  cooldown: WorkoutExercise[],
): string {
  const fmt = (ex: WorkoutExercise) => {
    const parts = [ex.exercise];
    if (ex.sets) parts.push(`${ex.sets} sets`);
    if (ex.reps) parts.push(`× ${ex.reps}`);
    return parts.join(" ");
  };
  const sections: string[] = [];
  if (warmup?.length) sections.push("Warm-up:\n" + warmup.map(fmt).join("\n"));
  if (workout?.length) sections.push("Workout:\n" + workout.map(fmt).join("\n"));
  if (cooldown?.length) sections.push("Cool-down:\n" + cooldown.map(fmt).join("\n"));
  return sections.join("\n\n");
}

function extractJson(text: string): PlanPayload {
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = fence ? fence[1].trim() : text.trim();
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("No JSON object found in model output");
  return JSON.parse(raw.slice(start, end + 1)) as PlanPayload;
}

async function sendNtfy(title: string, message: string): Promise<void> {
  const topic = process.env.NTFY_TOPIC;
  if (!topic) return;
  await fetch(`https://ntfy.sh/${topic}`, {
    method: "POST",
    headers: { Title: title, Priority: "default" },
    body: message,
  }).catch(() => {});
}

export async function GET(req: Request) {
  if (!checkAuth(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const uid = process.env.OWNER_USER_ID;
  if (!uid) return NextResponse.json({ error: "OWNER_USER_ID not configured" }, { status: 500 });

  // 1. Fetch prior-week planning context from internal endpoint
  const contextRes = await fetch(`${APP_URL}/api/internal/plan`, {
    headers: { Authorization: `Bearer ${CRON_SECRET}` },
  });
  if (!contextRes.ok) {
    const body = await contextRes.text();
    return NextResponse.json(
      { error: `Failed to fetch planning context: ${contextRes.status} — ${body}` },
      { status: 502 },
    );
  }
  const planningContext = await contextRes.text();

  // 2. Generate weekly plan via Claude
  const { text } = await generateText({
    model: anthropic("claude-haiku-4-5-20251001"),
    messages: [
      {
        role: "user",
        content: `You are Mr. Bridge's weekly planning agent. Using the prior-week health and fitness data below, produce a complete weekly workout plan and meal prep task for the coming week.

${planningContext}

---

OUTPUT RULES:
- Return ONLY valid JSON in a code block (no explanation before or after).
- JSON schema:
{
  "workout_days": [
    {
      "date": "YYYY-MM-DD",
      "name": "Push Day",
      "warmup": [{"exercise": "...", "sets": N, "reps": "...", "description": "1-3 sentences on how to perform", "tips": ["form cue"]}],
      "workout": [...same shape...],
      "cooldown": [...same shape...],
      "notes": "brief rationale e.g. readiness was 72 — standard load"
    }
  ],
  "meal_prep_task": {
    "title": "Meal prep — week of YYYY-MM-DD",
    "priority": "medium",
    "due_date": "YYYY-MM-DD",
    "category": "nutrition",
    "metadata": {
      "source": "weekly_planning_agent",
      "week_start": "YYYY-MM-DD",
      "recommendations": ["batch cook chicken breast x4", "prep overnight oats x3"]
    }
  }
}

PLANNING GUIDELINES:
- Schedule workout days based on preferred_workout_days profile key (default: Mon, Tue, Thu, Sat — 4 days/week).
- If avg readiness < 65 for the prior week, reduce to 3 days and note deload.
- If any single-day readiness < 50, drop one workout day and flag it in notes.
- Vary the workout split — avoid repeating the same day-order as the prior week.
- Use only exercises suited to the user's equipment (check profile for equipment keys); if no equipment data, assume bodyweight + dumbbells.
- Include description and tips for every exercise.
- Meal prep recommendations should align with cuisine_preferences (Korean, Southeast Asian) and profile macro goals.
- If a data source is missing (e.g., no Oura data), note it in workout notes and continue with best-effort planning.`,
      },
    ],
  });

  // 3. Parse JSON from model output
  let plan: PlanPayload;
  try {
    plan = extractJson(text);
  } catch (err) {
    console.error("[weekly-plan] JSON parse failed:", err, "\nRaw output:", text);
    await sendNtfy("Weekly Plan Failed", "Could not parse plan JSON from model output.");
    return NextResponse.json(
      { error: "Failed to parse plan JSON", raw: text.slice(0, 500) },
      { status: 500 },
    );
  }

  // 4. Write plan to Supabase via internal endpoint
  const writeRes = await fetch(`${APP_URL}/api/internal/plan`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${CRON_SECRET}`,
    },
    body: JSON.stringify(plan),
  });
  const writeBody = (await writeRes.json()) as {
    ok?: boolean;
    skipped?: boolean;
    message?: string;
    errors?: string[];
  };

  if (!writeRes.ok) {
    console.error("[weekly-plan] Write failed:", writeBody);
    await sendNtfy(
      "Weekly Plan Failed",
      `Supabase write error: ${JSON.stringify(writeBody.errors)}`,
    );
    return NextResponse.json({ error: "Write failed", details: writeBody }, { status: 502 });
  }

  if (writeBody.skipped) {
    console.log("[weekly-plan] Skipped —", writeBody.message);
    return NextResponse.json({ ok: true, skipped: true, message: writeBody.message });
  }

  // 5. Create Google Calendar events for each workout day
  const calendarResults: Record<string, string | null> = {};
  const db = createServiceClient();

  try {
    const auth = await getGoogleAuthClient({ db, userId: uid });
    const cal = google.calendar({ version: "v3", auth });

    for (const day of plan.workout_days ?? []) {
      if (!day.date) continue;
      const title = `Workout — ${new Date(`${day.date}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "long" })}`;
      const description = buildCalendarDescription(
        day.warmup ?? [],
        day.workout ?? [],
        day.cooldown ?? [],
      );
      try {
        const res = await cal.events.insert({
          calendarId: "primary",
          requestBody: {
            summary: title,
            description,
            start: { dateTime: `${day.date}T${DEFAULT_WORKOUT_TIME}:00`, timeZone: TZ },
            end: { dateTime: `${day.date}T${DEFAULT_WORKOUT_END}:00`, timeZone: TZ },
          },
        });
        const eventId = res.data.id ?? null;
        calendarResults[day.date] = eventId;
        if (eventId) {
          await db
            .from("workout_plans")
            .update({ calendar_event_id: eventId })
            .eq("user_id", uid)
            .eq("date", day.date);
        }
      } catch (calErr) {
        console.warn(`[weekly-plan] Calendar insert failed for ${day.date}:`, calErr);
        calendarResults[day.date] = null;
      }
    }
  } catch (authErr) {
    console.warn("[weekly-plan] Google Calendar skipped:", authErr);
  }

  // 6. Push notification
  const workoutCount = (plan.workout_days ?? []).filter((d) => d.date).length;
  const weekStart = plan.meal_prep_task?.metadata?.week_start ?? plan.workout_days?.[0]?.date ?? "";
  await sendNtfy(
    "Weekly Plan Ready",
    `${workoutCount} workout${workoutCount !== 1 ? "s" : ""} + meal prep scheduled for week of ${weekStart}.`,
  );

  return NextResponse.json({
    ok: true,
    message: writeBody.message,
    calendar: calendarResults,
  });
}
