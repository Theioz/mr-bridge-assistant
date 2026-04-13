export const dynamic = "force-dynamic";

import { createClient } from "@/lib/supabase/server";
import { daysAgoString } from "@/lib/timezone";
import { getWindow } from "@/lib/window";
import { WindowSelector } from "@/components/ui/window-selector";
import { BodyCompDualChart } from "@/components/fitness/body-comp-dual-chart";
import { WorkoutFreqChart } from "@/components/fitness/workout-freq-chart";
import { ActiveCalGoalChart } from "@/components/fitness/active-cal-goal-chart";
import { WeightGoalChart } from "@/components/fitness/weight-goal-chart";
import { BodyFatGoalChart } from "@/components/fitness/body-fat-goal-chart";
import { WorkoutHistoryTable } from "@/components/fitness/workout-history-table";
import type { FitnessLog, WorkoutSession, RecoveryMetrics } from "@/lib/types";

export default async function FitnessPage() {
  const supabase = await createClient();
  const { key: windowKey, days } = await getWindow();
  const weekCount = Math.ceil(days / 7);

  const [fitnessRes, workoutsRes, recoveryRes, profileRes] = await Promise.all([
    supabase
      .from("fitness_log")
      .select("*")
      .not("body_fat_pct", "is", null)
      .gte("date", daysAgoString(days - 1))
      .order("date", { ascending: true }),
    supabase
      .from("workout_sessions")
      .select("*")
      .gte("date", daysAgoString((weekCount * 7) - 1))
      .order("date", { ascending: false }),
    supabase
      .from("recovery_metrics")
      .select("date,active_cal")
      .gte("date", daysAgoString((weekCount * 7) - 1))
      .order("date", { ascending: true }),
    supabase
      .from("profile")
      .select("key,value")
      .in("key", [
        "weekly_workout_goal",
        "weekly_active_cal_goal",
        "weight_goal_lbs",
        "body_fat_goal_pct",
      ]),
  ]);

  const fitnessData = (fitnessRes.data ?? []) as FitnessLog[];
  const allWorkouts = (workoutsRes.data ?? []) as WorkoutSession[];
  const recoveryData = (recoveryRes.data ?? []) as Pick<RecoveryMetrics, "date" | "active_cal">[];

  const workouts     = allWorkouts.filter((w) => !/walk/i.test(w.activity));
  const walkSessions = allWorkouts.filter((w) => /walk/i.test(w.activity));

  // "Walks this week" = last 7 days
  const weekStart = daysAgoString(6);
  const walksThisWeek = walkSessions.filter((w) => w.date >= weekStart);
  const walkCount    = walksThisWeek.length;
  const walkDuration = walksThisWeek.reduce((s, w) => s + (w.duration_mins ?? 0), 0);

  const goals: Record<string, number | null> = {};
  for (const row of profileRes.data ?? []) {
    const n = parseFloat(row.value ?? "");
    goals[row.key] = isNaN(n) ? null : n;
  }

  const weeklyWorkoutGoal   = goals["weekly_workout_goal"]   ?? null;
  const weeklyActiveCalGoal = goals["weekly_active_cal_goal"] ?? null;
  const weightGoal          = goals["weight_goal_lbs"]        ?? null;
  const bodyFatGoal         = goals["body_fat_goal_pct"]      ?? null;

  const latest = fitnessData[fitnessData.length - 1] ?? null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-heading font-semibold" style={{ fontSize: 24, color: "var(--color-text)" }}>
            Fitness
          </h1>
          {latest && (
            <p className="mt-1" style={{ fontSize: 14, color: "var(--color-text-muted)" }}>
              {latest.weight_lb} lb · {latest.body_fat_pct}% body fat · {latest.date}
            </p>
          )}
        </div>
        <WindowSelector current={windowKey} />
      </div>

      {/* Body composition trend */}
      <BodyCompDualChart data={fitnessData} windowLabel={windowKey.toUpperCase()} />

      {/* Weekly frequency + active cal vs goals */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="flex flex-col gap-2">
          <WorkoutFreqChart
            sessions={workouts}
            days={days}
            goal={weeklyWorkoutGoal}
          />
          {walkCount > 0 && (
            <div
              className="rounded-lg px-4 py-2.5 flex items-center gap-3"
              style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)" }}
            >
              <span className="text-xs uppercase tracking-widest" style={{ color: "var(--color-text-muted)", letterSpacing: "0.07em" }}>
                Walks this week
              </span>
              <span className="text-sm font-semibold tabular-nums" style={{ color: "var(--color-text)" }}>
                {walkCount}
              </span>
              {walkDuration > 0 && (
                <span className="text-xs tabular-nums" style={{ color: "var(--color-text-muted)" }}>
                  {walkDuration >= 60 ? `${Math.floor(walkDuration / 60)}h ${walkDuration % 60}m` : `${walkDuration}m`}
                </span>
              )}
            </div>
          )}
        </div>
        <ActiveCalGoalChart
          data={recoveryData}
          goal={weeklyActiveCalGoal}
          days={days}
        />
      </div>

      {/* Weight + body fat progress toward goals */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <WeightGoalChart
          data={fitnessData}
          goal={weightGoal}
          windowLabel={windowKey.toUpperCase()}
        />
        <BodyFatGoalChart
          data={fitnessData}
          goal={bodyFatGoal}
          windowLabel={windowKey.toUpperCase()}
        />
      </div>

      <WorkoutHistoryTable workouts={allWorkouts} />
    </div>
  );
}
