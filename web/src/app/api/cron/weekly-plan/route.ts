import { NextResponse } from "next/server";
import { anthropic } from "@ai-sdk/anthropic";
import { generateText } from "ai";
import { google } from "googleapis";
import { createServiceClient } from "@/lib/supabase/service";
import { getGoogleAuthClient } from "@/lib/google-auth";
import { validateWeeklyCoverage, checkSameDayRedundancy } from "@/lib/fitness/movement-patterns";
import { validateRecovery, type DayPlan } from "@/lib/fitness/recovery-rules";
import { ruleHrvDecline, ruleHighRpe, ruleSleepDeficit } from "@/lib/chat/proactivity-context";

export const maxDuration = 120;

const APP_URL = process.env.APP_URL ?? "https://mr-bridge-assistant.vercel.app";
const CRON_SECRET = process.env.CRON_SECRET;
const TZ = process.env.USER_TIMEZONE ?? "America/Los_Angeles";
const DEFAULT_WORKOUT_TIME = "16:00";
const DEFAULT_WORKOUT_DURATION_MINS = 60;

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

// Convert plan payload to DayPlan[] for structural validation
function toDayPlans(plan: PlanPayload): DayPlan[] {
  return (plan.workout_days ?? [])
    .filter((d) => d.date)
    .map((d) => ({
      dayOfWeek: new Date(`${d.date}T12:00:00Z`).getDay(),
      exercises: [...(d.warmup ?? []), ...(d.workout ?? []), ...(d.cooldown ?? [])].map((ex) => ({
        name: ex.exercise,
        sets: ex.sets ?? 1,
        reps: ex.reps ?? "0",
      })),
    }));
}

function getAllExerciseNames(plan: PlanPayload): string[] {
  return (plan.workout_days ?? []).flatMap((d) =>
    [...(d.warmup ?? []), ...(d.workout ?? []), ...(d.cooldown ?? [])].map((ex) => ex.exercise),
  );
}

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// Validate plan structure and return a correction prompt if issues exist, or null if clean
function buildCorrectionPromptIfNeeded(plan: PlanPayload, hasPullUpBar: boolean): string | null {
  const dayPlans = toDayPlans(plan);
  const allExercises = getAllExerciseNames(plan);
  const recoveryViolations = validateRecovery(dayPlans);
  const { missing: missingPatterns } = validateWeeklyCoverage(allExercises, hasPullUpBar);
  const redundancyIssues = dayPlans.flatMap((dp) =>
    checkSameDayRedundancy(dp.exercises.map((e) => e.name)).map((issue) => ({
      day: dp.dayOfWeek,
      ...issue,
    })),
  );

  if (
    recoveryViolations.length === 0 &&
    missingPatterns.length === 0 &&
    redundancyIssues.length === 0
  ) {
    return null;
  }

  const issues: string[] = [];

  if (missingPatterns.length > 0) {
    issues.push(
      `MISSING MOVEMENT PATTERNS: ${missingPatterns.join(", ")} — add at least one exercise covering each missing pattern across the week.`,
    );
  }

  for (const { day, exerciseA, exerciseB, sharedPattern } of redundancyIssues) {
    issues.push(
      `REDUNDANT SEQUENCING on ${DAY_NAMES[day]}: "${exerciseA}" immediately followed by "${exerciseB}" (both target ${sharedPattern}) — insert an exercise from a different pattern between them, or replace one with a different movement.`,
    );
  }

  for (const v of recoveryViolations) {
    issues.push(
      `RECOVERY CONFLICT: ${v.message} — restructure so the second session is ≤${Math.ceil(v.firstVolume * 0.5)} sets for ${v.muscleGroup}, or move one day to allow ≥48h between sessions.`,
    );
  }

  return `The workout plan below has structural issues. Return ONLY a corrected JSON plan in a code block, fixing exactly the issues listed. Do not change exercises that are not flagged.

CURRENT PLAN:
\`\`\`json
${JSON.stringify(plan, null, 2)}
\`\`\`

ISSUES TO FIX:
${issues.map((issue, i) => `${i + 1}. ${issue}`).join("\n")}

Return only the corrected JSON. Same schema as before.`;
}

function buildPlannerPrompt(planningContext: string, recoveryFlags: string[]): string {
  const recoverySection =
    recoveryFlags.length > 0
      ? `\nRECOVERY FLAGS (from database — act on these):\n${recoveryFlags.map((f) => `- ${f}`).join("\n")}\n`
      : "";

  return `You are Mr. Bridge's weekly planning agent. You are not generating a generic workout week — you are EVOLVING the user's training based on last week's actual performance, recovery state, equipment constraints, and goal phase.

${planningContext}
${recoverySection}
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
      "notes": "rationale — cite evidence e.g. 'DB Bent-Over Row 3×12 @ 25 lb avg RPE 8.3 last week — top of range, prescribing same load with tempo added'"
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

SCHEDULING:
- Use preferred_workout_days from profile (default: Mon, Tue, Thu, Sat — 4 days/week).
- If avg readiness < 65 for prior week, reduce to 3 days and note deload.
- If any single-day readiness < 50, drop one workout day and flag it in notes.
- If HRV has been declining 3+ consecutive days or chronic high RPE is flagged above, reduce intensity across all days and avoid max-effort sets.

MOVEMENT PATTERN COVERAGE (mandatory — validate before returning):
The week MUST include at least one working set from each pattern:
- squat (e.g. Goblet Squat, Bulgarian Split Squat, Reverse Lunge)
- hinge (e.g. Romanian Deadlift, Glute Bridge, Slider Hamstring Curl)
- push_horizontal (e.g. Floor Press, Push-Up, Slider Push-Up)
- push_vertical (e.g. Overhead Press, Pike Push-Up)
- pull_horizontal (e.g. Bent-Over Row, Single-Arm Row)
- pull_vertical (e.g. Pull-Up, Chin-Up, Banded Pulldown) — REQUIRED if pull-up bar is in equipment inventory
- core (e.g. Plank, Dead Bug, Slider Body Saw, Hollow Hold)
Never place 2+ exercises sharing the same pattern AND same equipment type back-to-back within a day (e.g. DB Bent-Over Row immediately followed by DB Single-Arm Row). Break them up with a different pattern.

EQUIPMENT-CAPPED PROGRESSION (apply when user is at max DB weight):
When an exercise has been performed at the user's equipment cap at avg RPE ≤ 8 for 2+ sessions, do NOT repeat the same prescription. Apply the progression ladder in order:
1. Add reps (target 20+ rep range)
2. Add 3-second eccentric tempo
3. Add 2-second pause at hardest position
4. Convert to unilateral variant (effective load doubles) — e.g. Goblet Squat → Bulgarian Split Squat
5. Mechanical drop set
6. Add resistance band
7. Reduce rest by 30 seconds
Always surface the rationale: "Held 25 lb Goblet Squat at RPE 6 for 3 sessions — converting to Bulgarian Split Squat (same DB, ~2× effective stimulus)."

PROGRESSION RULES (use LAST WEEK'S EXERCISE PERFORMANCE data):
- If last 2 sessions hit top-of-range reps at prescribed weight → suggest +5 lb upper-body compound / +10 lb lower-body compound / +2.5–5 lb isolation (lateral raises, curls, flies), subject to equipment cap
- If RPE ≥ 9 on working sets for 2+ sessions → hold weight
- If target reps missed 2 sessions in a row → 10% deload
- If no progression across 4+ sessions → first adjust rep scheme (e.g. 3×10 → 4×8) or add tempo/pause; only swap variation if still flat after that
- Never count cancelled sessions in progression analysis
- Surface the evidence in notes for every progression decision

MUSCLE GROUP RECOVERY (validate before returning):
No muscle group should be hit twice within 48 hours at >50% of the first session's set volume. If Thursday hits quads with 9 sets, Saturday may include ≤4 sets of quad-dominant work — or restructure the split.

GOAL PHASE (check goal_phase profile key):
- cut: 10-15 sets/muscle/week, compound-heavy, minimal metabolic finishers, preserve lean mass
- bulk: 12-20 sets/muscle/week, progressive overload priority, less cardio
- maintain: 8-12 sets/muscle/week, variety > overload
- recomp: hybrid — high-protein assumed, conservative volume

EXERCISE SELECTION:
- Use only exercises suited to available equipment (check profile equipment keys); default to bodyweight + dumbbells if no data
- Vary the split — avoid repeating the same day-order as the prior week
- Include description and tips for every exercise
- Add at least one direct hamstring exercise per lower-body day (e.g. Slider Hamstring Curl, Single-Leg RDL)

MEAL PREP:
- Align with cuisine_preferences (Korean, Southeast Asian) and profile macro goals
- Integrate goal_phase: cut → higher-protein, lower-carb options; bulk → calorie-dense options

If a data source is missing (e.g. no Oura data), note it in workout notes and continue with best-effort planning.`;
}

export async function GET(req: Request) {
  if (!checkAuth(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const uid = process.env.OWNER_USER_ID;
  if (!uid) return NextResponse.json({ error: "OWNER_USER_ID not configured" }, { status: 500 });

  const db = createServiceClient();

  // Fetch profile, equipment, and recovery flags in parallel
  const [profileRes, equipmentRes, hrvSignal, rpeSignal, sleepSignal] = await Promise.allSettled([
    db.from("profile").select("key,value").eq("user_id", uid),
    db.from("user_equipment").select("equipment_type").eq("user_id", uid),
    ruleHrvDecline(uid, db),
    ruleHighRpe(uid, db),
    ruleSleepDeficit(uid, db),
  ]);

  const profileRows: { key: string; value: string }[] =
    profileRes.status === "fulfilled" ? (profileRes.value.data ?? []) : [];
  const equipmentRows: { equipment_type: string }[] =
    equipmentRes.status === "fulfilled" ? (equipmentRes.value.data ?? []) : [];

  const profileMap = Object.fromEntries(profileRows.map((r) => [r.key, r.value]));
  const workoutStart = profileMap.preferred_workout_time ?? DEFAULT_WORKOUT_TIME;
  const workoutEnd = (() => {
    if (profileMap.preferred_workout_end) return profileMap.preferred_workout_end;
    const [h, m] = workoutStart.split(":").map(Number);
    const endMins = h * 60 + m + DEFAULT_WORKOUT_DURATION_MINS;
    return `${String(Math.floor(endMins / 60)).padStart(2, "0")}:${String(endMins % 60).padStart(2, "0")}`;
  })();
  const hasPullUpBar = equipmentRows.some((r) => r.equipment_type.toLowerCase().includes("pull"));

  const recoveryFlags: string[] = [
    hrvSignal.status === "fulfilled" ? hrvSignal.value : null,
    rpeSignal.status === "fulfilled" ? rpeSignal.value : null,
    sleepSignal.status === "fulfilled" ? sleepSignal.value : null,
  ].filter((s): s is string => s !== null);

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

  // 2. Generate weekly plan — first pass
  const prompt = buildPlannerPrompt(planningContext, recoveryFlags);
  let plan: PlanPayload;

  try {
    const { text: text1 } = await generateText({
      model: anthropic("claude-sonnet-4-6"),
      messages: [{ role: "user", content: prompt }],
    });
    plan = extractJson(text1);
  } catch (err) {
    console.error("[weekly-plan] First pass failed:", err);
    await sendNtfy("Weekly Plan Failed", "Could not parse plan JSON from model output.");
    return NextResponse.json({ error: "Failed to parse plan JSON" }, { status: 500 });
  }

  // 3. Validate structure and optionally correct
  const correctionPrompt = buildCorrectionPromptIfNeeded(plan, hasPullUpBar);
  if (correctionPrompt) {
    console.log("[weekly-plan] Structural issues found, running correction pass");
    try {
      const { text: text2 } = await generateText({
        model: anthropic("claude-sonnet-4-6"),
        messages: [{ role: "user", content: correctionPrompt }],
      });
      plan = extractJson(text2);
    } catch (err) {
      // Correction pass failed — log and continue with first-pass plan
      console.warn("[weekly-plan] Correction pass failed, using first-pass plan:", err);
    }
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
            start: { dateTime: `${day.date}T${workoutStart}:00`, timeZone: TZ },
            end: { dateTime: `${day.date}T${workoutEnd}:00`, timeZone: TZ },
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
