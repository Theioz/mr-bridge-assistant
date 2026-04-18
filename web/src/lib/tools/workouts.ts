import { tool, jsonSchema } from "ai";
import { google } from "googleapis";
import { getGoogleAuthClient } from "@/lib/google-auth";
import { todayString, daysAgoString, addDays } from "@/lib/timezone";
import { ok, err } from "./_contract";
import { STRICT_TOOLS } from "./_strict";
import type { ToolContext } from "./_context";

interface WorkoutExercise {
  exercise: string;
  sets?: number;
  reps?: string;
  weight_lbs?: number | null;
  notes?: string | null;
}

function buildCalendarDescription(
  warmup: WorkoutExercise[],
  workout: WorkoutExercise[],
  cooldown: WorkoutExercise[]
): string {
  const fmt = (ex: WorkoutExercise) => {
    const parts = [ex.exercise];
    if (ex.sets) parts.push(`${ex.sets} sets`);
    if (ex.reps) parts.push(`× ${ex.reps}`);
    if (ex.weight_lbs) parts.push(`@ ${ex.weight_lbs} lbs`);
    return parts.join(" ");
  };
  const sections: string[] = [];
  if (warmup.length) sections.push("Warm-up:\n" + warmup.map(fmt).join("\n"));
  if (workout.length) sections.push("Workout:\n" + workout.map(fmt).join("\n"));
  if (cooldown.length) sections.push("Cool-down:\n" + cooldown.map(fmt).join("\n"));
  return sections.join("\n\n");
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)
    ),
  ]);
}

export function buildWorkoutTools({ supabase, userId, isDemo }: ToolContext) {
  return {
    get_workout_plan: tool({
      description: "Fetch the workout plan for the current Mon–Sun week. No parameters. Call this before making any adjustment or suggestion to the user's workout program.",
      inputSchema: jsonSchema<Record<string, never>>({
        type: "object",
        properties: {},
      }),
      execute: async () => {
        if (!userId) return { error: "Not authenticated" };
        if (isDemo) return { demo: true, note: "Demo mode — no real workout plans." };
        const todayStr = todayString();
        const dow = (new Date(`${todayStr}T12:00:00Z`).getUTCDay() + 6) % 7; // 0=Mon, 6=Sun
        const monday = addDays(todayStr, -dow);
        const sunday = addDays(monday, 6);
        const { data, error } = await supabase
          .from("workout_plans")
          .select("*")
          .eq("user_id", userId)
          .gte("date", monday)
          .lte("date", sunday)
          .order("date", { ascending: true });
        if (error) return { error: error.message };
        return { week: `${monday} – ${sunday}`, plans: data ?? [] };
      },
    }),

    assign_workout: tool({
      description: "Assign or replace one day's workout plan. Upserts to workout_plans and optionally creates/updates the matching Google Calendar event. Pre-flight required when update_calendar is true: (1) ask the user what time their workout will be if start_time is unknown, (2) call list_calendar_events for the target date, check for time overlaps and duplicate Workout titles, surface any conflicts to the user, and get confirmation before calling this tool.",
      inputSchema: jsonSchema<{
        date: string;
        name?: string;
        warmup: WorkoutExercise[];
        workout: WorkoutExercise[];
        cooldown: WorkoutExercise[];
        notes?: string;
        start_time?: string;
        end_time?: string;
        update_calendar?: boolean;
      }>({
        type: "object",
        required: ["date", "warmup", "workout", "cooldown"],
        properties: {
          date: { type: "string", description: "Date in YYYY-MM-DD format." },
          name: { type: "string", description: "Workout name shown on the fitness page card, e.g. 'Push Day', 'Pull Day', 'Legs'." },
          warmup: { type: "array", items: { type: "object" }, description: "Warm-up exercises." },
          workout: { type: "array", items: { type: "object" }, description: "Main workout exercises." },
          cooldown: { type: "array", items: { type: "object" }, description: "Cool-down exercises." },
          notes: { type: "string", description: "Optional plan notes." },
          start_time: { type: "string", description: "Workout start time in HH:MM (24h) format." },
          end_time: { type: "string", description: "Workout end time in HH:MM (24h) format. Defaults to start_time + 1 hour." },
          update_calendar: { type: "boolean", description: "Create/update a Google Calendar event. Default true." },
        },
      }),
      strict: STRICT_TOOLS.assign_workout,
      execute: async ({ date, name, warmup, workout, cooldown, notes, start_time, end_time, update_calendar = true }) => {
        if (!userId) return err("Not authenticated");
        if (isDemo) return ok({ demo: true, note: "Demo mode — plan not saved." });

        const { data: upserted, error: upsertError } = await supabase
          .from("workout_plans")
          .upsert(
            { user_id: userId, date, name: name ?? null, warmup, workout, cooldown, notes: notes ?? null, updated_at: new Date().toISOString() },
            { onConflict: "user_id,date" }
          )
          .select()
          .single();
        if (upsertError) return err(upsertError.message);
        if (!upserted) return err("Workout plan upsert returned no row — plan may not have been saved.");

        if (!update_calendar) {
          return ok({ plan: upserted, calendar_synced: false });
        }

        try {
          const auth = getGoogleAuthClient();
          const calendar = google.calendar({ version: "v3", auth });
          const description = buildCalendarDescription(warmup, workout, cooldown);
          const title = `Workout — ${new Date(date + "T00:00:00").toLocaleDateString("en-US", { weekday: "long" })}`;
          const tz = process.env.USER_TIMEZONE ?? "America/Los_Angeles";

          let startObj: object;
          let endObj: object;
          if (start_time) {
            const computedEnd = end_time ?? (() => {
              const [h, m] = start_time.split(":").map(Number);
              return `${String((h + 1) % 24).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
            })();
            startObj = { dateTime: `${date}T${start_time}:00`, timeZone: tz };
            endObj = { dateTime: `${date}T${computedEnd}:00`, timeZone: tz };
          } else {
            startObj = { date };
            endObj = { date };
          }

          let eventId: string | null = upserted.calendar_event_id ?? null;
          if (eventId) {
            await withTimeout(
              calendar.events.patch({
                calendarId: "primary",
                eventId,
                requestBody: { summary: title, description, start: startObj, end: endObj },
              }),
              8000,
              "calendar patch"
            );
          } else {
            const res = await withTimeout(
              calendar.events.insert({
                calendarId: "primary",
                requestBody: { summary: title, start: startObj, end: endObj, description },
              }),
              8000,
              "calendar insert"
            );
            eventId = res.data.id ?? null;
            await supabase
              .from("workout_plans")
              .update({ calendar_event_id: eventId })
              .eq("user_id", userId)
              .eq("date", date);
            upserted.calendar_event_id = eventId;
          }
          return ok({ plan: upserted, calendar_synced: true });
        } catch (calErr) {
          // Plan saved but calendar sync failed — partial success surfaced to
          // the model so it tells the user instead of claiming full success.
          return ok({
            plan: upserted,
            calendar_synced: false,
            calendar_error: calErr instanceof Error ? calErr.message : "Calendar sync failed",
          });
        }
      },
    }),

    update_workout_exercise: tool({
      description: "Patch a single exercise in one phase of an existing workout plan. Fetches the row, finds the exercise by name (case-insensitive), merges the updates, upserts back, and refreshes the calendar event description. Supports renaming/swapping the exercise via updates.exercise.",
      inputSchema: jsonSchema<{
        date: string;
        phase: "warmup" | "workout" | "cooldown";
        exercise_name: string;
        updates: { exercise?: string; sets?: number; reps?: string; weight_lbs?: number; notes?: string };
      }>({
        type: "object",
        required: ["date", "phase", "exercise_name", "updates"],
        properties: {
          date: { type: "string", description: "YYYY-MM-DD date of the plan to edit." },
          phase: { type: "string", enum: ["warmup", "workout", "cooldown"], description: "Which phase the exercise is in." },
          exercise_name: { type: "string", description: "Existing exercise name to match (case-insensitive)." },
          updates: {
            type: "object",
            description: "Fields to merge into the matched exercise object. Use `exercise` to rename/swap.",
            properties: {
              exercise: { type: "string", description: "New exercise name (for swaps/renames)." },
              sets: { type: "number" },
              reps: { type: "string" },
              weight_lbs: { type: "number" },
              notes: { type: "string" },
            },
          },
        },
      }),
      strict: STRICT_TOOLS.update_workout_exercise,
      execute: async ({ date, phase, exercise_name, updates }) => {
        if (!userId) return err("Not authenticated");
        if (isDemo) return ok({ demo: true, note: "Demo mode — not saved." });

        const { data: row, error: fetchErr } = await supabase
          .from("workout_plans")
          .select("*")
          .eq("user_id", userId)
          .eq("date", date)
          .single();
        if (fetchErr) return err(fetchErr.message);
        if (!row) return err("No plan found for that date.");

        const arr: WorkoutExercise[] = [...(row[phase] as WorkoutExercise[])];
        const idx = arr.findIndex((e) => e.exercise.toLowerCase() === exercise_name.toLowerCase());
        if (idx === -1) {
          const existingNames = arr.map((e) => e.exercise);
          return err(
            `Exercise "${exercise_name}" not found in ${phase}. ` +
            `Current ${phase} exercises: ${existingNames.length ? existingNames.join(", ") : "(empty)"}. ` +
            `Suggest one of these, or propose adding a new exercise — do not invent names.`
          );
        }
        if (!updates || Object.keys(updates).length === 0) {
          return err("No fields provided to update. Specify at least one of: exercise, sets, reps, weight_lbs, notes.");
        }
        const expectedExercise = { ...arr[idx], ...updates };
        arr[idx] = expectedExercise;

        const { data: updated, error: upErr } = await supabase
          .from("workout_plans")
          .update({ [phase]: arr, updated_at: new Date().toISOString() })
          .eq("user_id", userId)
          .eq("date", date)
          .select()
          .single();
        if (upErr) return err(upErr.message);
        if (!updated) return err("Workout plan update returned no row — change may not have been saved.");

        // Read-after-write verification (#319 / #239 pattern): re-read the row
        // and confirm the matched exercise actually contains the requested
        // updates. Catches the silent-mismatch class where the update appears
        // to succeed but the row reads back unchanged.
        const verifiedArr = (updated[phase] as WorkoutExercise[]) ?? [];
        const verifiedExercise = verifiedArr[idx];
        const fieldChecks = Object.entries(updates).filter(
          ([key, value]) => (verifiedExercise as unknown as Record<string, unknown>)[key] !== value
        );
        if (fieldChecks.length > 0) {
          return err(
            `Workout plan update returned but the row read-back doesn't show the change: ${fieldChecks
              .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
              .join(", ")}`
          );
        }

        let calendar_synced: boolean | null = null;
        let calendar_error: string | undefined;
        if (updated.calendar_event_id) {
          try {
            const auth = getGoogleAuthClient();
            const calendar = google.calendar({ version: "v3", auth });
            const description = buildCalendarDescription(updated.warmup, updated.workout, updated.cooldown);
            await withTimeout(
              calendar.events.patch({
                calendarId: "primary",
                eventId: updated.calendar_event_id,
                requestBody: { description },
              }),
              8000,
              "calendar patch"
            );
            calendar_synced = true;
          } catch (calErr) {
            calendar_synced = false;
            calendar_error = calErr instanceof Error ? calErr.message : "Calendar description sync failed";
          }
        }

        return ok({ plan: updated, calendar_synced, ...(calendar_error ? { calendar_error } : {}) });
      },
    }),

    get_workout_history: tool({
      description: "Fetch logged strength-session performance (actual sets/reps/weights/RPE/notes) for progression analysis. Returns recent sessions scoped to the user, with per-set detail. Use this before suggesting progression for any exercise. Weights are returned in kg canonically — call get_profile for the user's weight_unit preference before reporting numbers.",
      inputSchema: jsonSchema<{ exercise_name?: string; days?: number }>({
        type: "object",
        properties: {
          exercise_name: {
            type: "string",
            description: "Optional exercise name (case-insensitive partial match). Omit to get the full recent history across all exercises.",
          },
          days: {
            type: "number",
            description: "Number of days back to include. Defaults to 30.",
          },
        },
      }),
      execute: async ({ exercise_name, days = 30 }) => {
        if (!userId) return { error: "Not authenticated" };
        if (isDemo) return { demo: true, note: "Demo mode — no real strength history.", sessions: [] };

        const sinceStr = daysAgoString(Math.max(1, Math.round(days)));
        const { data: sessions, error } = await supabase
          .from("strength_sessions")
          .select("id, performed_on, started_at, completed_at, perceived_effort, notes, sets:strength_session_sets(exercise_name, exercise_order, set_number, weight_kg, reps, rpe, notes)")
          .eq("user_id", userId)
          .gte("performed_on", sinceStr)
          .order("performed_on", { ascending: false })
          .limit(30);
        if (error) return { error: error.message };

        interface SetRow {
          exercise_name: string;
          exercise_order: number;
          set_number: number;
          weight_kg: number | null;
          reps: number | null;
          rpe: number | null;
          notes: string | null;
        }
        interface SessionRow {
          id: string;
          performed_on: string;
          started_at: string | null;
          completed_at: string | null;
          perceived_effort: number | null;
          notes: string | null;
          sets: SetRow[];
        }

        const rows = (sessions ?? []) as SessionRow[];
        const filtered = exercise_name
          ? rows
              .map((s) => ({
                ...s,
                sets: s.sets.filter((set) =>
                  set.exercise_name.toLowerCase().includes(exercise_name.toLowerCase())
                ),
              }))
              .filter((s) => s.sets.length > 0)
          : rows;

        return {
          window_days: days,
          exercise_filter: exercise_name ?? null,
          weight_unit: "kg",
          session_count: filtered.length,
          sessions: filtered.map((s) => ({
            session_id: s.id,
            performed_on: s.performed_on,
            started_at: s.started_at,
            completed_at: s.completed_at,
            perceived_effort: s.perceived_effort,
            notes: s.notes,
            sets: s.sets
              .slice()
              .sort((a, b) =>
                a.exercise_order !== b.exercise_order
                  ? a.exercise_order - b.exercise_order
                  : a.set_number - b.set_number
              ),
          })),
        };
      },
    }),
  };
}
