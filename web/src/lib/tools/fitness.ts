import { tool, jsonSchema } from "ai";
import { daysAgoString } from "@/lib/timezone";
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
          .eq("source", "oura")
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
  };
}
