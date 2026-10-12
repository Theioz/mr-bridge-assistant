import { tool, jsonSchema } from "ai";
import { daysAgoString, todayString } from "@/lib/timezone";
import { getHandLoggingSignal } from "@/lib/reentry-query";
import { loadMetricPreferences } from "@/lib/metric-preferences";
import type { ToolContext } from "./_context";

export function buildFitnessTools({ supabase, userId }: ToolContext) {
  return {
    get_fitness_summary: tool({
      description: "Get recent body composition, workouts, and recovery metrics.",
      inputSchema: jsonSchema<{ days?: number }>({
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

        // Load user's preferred source per metric; falls back to defaults if no rows exist.
        const prefs = userId ? await loadMetricPreferences(supabase, userId) : null;
        const sleepSource = prefs?.sleep ?? "oura";
        const bodySource = prefs?.body_composition ?? "google_health";

        let bodyQ = supabase
          .from("fitness_log")
          .select("date, weight_lb, body_fat_pct, bmi, muscle_mass_lb, visceral_fat, source")
          .not("body_fat_pct", "is", null)
          .eq("source", bodySource)
          .order("date", { ascending: false })
          .limit(2);
        let workQ = supabase
          .from("workout_sessions")
          .select("date, activity, duration_mins, calories, avg_hr, notes")
          .gte("date", sinceStr)
          .order("date", { ascending: false });
        // Use the preferred sleep/recovery source. Oura is the only recovery source
        // since #607 — Google Health writes no recovery_metrics.
        let recQ = supabase
          .from("recovery_metrics")
          .select("date, avg_hrv, resting_hr, sleep_score, readiness, source, steps, active_cal")
          .eq("source", sleepSource)
          .order("date", { ascending: false })
          .limit(1);
        if (userId) {
          bodyQ = bodyQ.eq("user_id", userId);
          workQ = workQ.eq("user_id", userId);
          recQ = recQ.eq("user_id", userId);
        }

        const [bodyCompResult, workoutsResult, recoveryResult] = await Promise.all([
          bodyQ,
          workQ,
          recQ,
        ]);

        return {
          body_composition: bodyCompResult.data ?? [],
          workouts: workoutsResult.data ?? [],
          recovery: recoveryResult.data?.[0] ?? null,
        };
      },
    }),

    get_logging_status: tool({
      description:
        "When the user last logged anything BY HAND (meal_log, habits, strength_sessions, " +
        "journal_entries — synced Oura/Google Health data does not count). Returns " +
        "{ lastHandLoggedOn, quietDays, reentry }; reentry is true after 3+ quiet days. " +
        "Call at session start. When reentry is true, open forward-only: help plan and log " +
        "TODAY. Do not list the missed days, do not offer to reconstruct or backfill them, and " +
        "never treat the gap as fasted or dry — absent rows mean unlogged.",
      inputSchema: jsonSchema<Record<string, never>>({ type: "object", properties: {} }),
      execute: async () => {
        try {
          return await getHandLoggingSignal(supabase, todayString(), userId || undefined);
        } catch (e) {
          return { error: e instanceof Error ? e.message : "Failed to read logging status" };
        }
      },
    }),
  };
}
