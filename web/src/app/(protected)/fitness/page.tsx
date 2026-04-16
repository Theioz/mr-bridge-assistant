export const dynamic = "force-dynamic";

import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { daysAgoString, todayString, addDays } from "@/lib/timezone";
import { getWindow } from "@/lib/window";

export const metadata: Metadata = {
  title: "Fitness",
  description: "Body composition, workout frequency, active calories, and goal trends.",
};
import { WindowSelector } from "@/components/ui/window-selector";
import { BodyCompDualChart } from "@/components/fitness/body-comp-dual-chart";
import { WorkoutFreqChart } from "@/components/fitness/workout-freq-chart";
import { ActiveCalGoalChart } from "@/components/fitness/active-cal-goal-chart";
import { WeightGoalChart } from "@/components/fitness/weight-goal-chart";
import { BodyFatGoalChart } from "@/components/fitness/body-fat-goal-chart";
import { WorkoutHistoryTable } from "@/components/fitness/workout-history-table";
import { WeeklyWorkoutPlan } from "@/components/fitness/weekly-workout-plan";
import { RecentSessionsList } from "@/components/fitness/recent-sessions-list";
import { ExerciseSparkline } from "@/components/fitness/exercise-sparkline";
import type {
  FitnessLog,
  WorkoutSession,
  RecoveryMetrics,
  WorkoutPlan,
  StrengthSession,
  StrengthSessionSet,
} from "@/lib/types";
import { parseWeightUnit } from "@/lib/units";

export default async function FitnessPage() {
  const supabase = await createClient();
  const { key: windowKey, days } = await getWindow();
  const weekCount = Math.ceil(days / 7);

  // Current ISO week bounds (Mon–Sun) in user's local timezone
  const todayStr = todayString();
  const dow = (new Date(`${todayStr}T12:00:00Z`).getUTCDay() + 6) % 7; // 0=Mon, 6=Sun
  const mondayStr = addDays(todayStr, -dow);
  const sundayStr = addDays(mondayStr, 6);

  const strengthSessionsSince = daysAgoString(89);

  const [
    fitnessRes,
    workoutsRes,
    recoveryRes,
    profileRes,
    weeklyPlansRes,
    strengthSessionsRes,
  ] = await Promise.all([
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
        "weight_unit",
      ]),
    supabase
      .from("workout_plans")
      .select("*")
      .gte("date", mondayStr)
      .lte("date", sundayStr)
      .order("date", { ascending: true }),
    supabase
      .from("strength_sessions")
      .select("*, sets:strength_session_sets(*)")
      .gte("performed_on", strengthSessionsSince)
      .order("performed_on", { ascending: false }),
  ]);

  const fitnessData = (fitnessRes.data ?? []) as FitnessLog[];
  const allWorkouts = (workoutsRes.data ?? []) as WorkoutSession[];
  const recoveryData = (recoveryRes.data ?? []) as Pick<RecoveryMetrics, "date" | "active_cal">[];
  const weeklyPlans = (weeklyPlansRes.data ?? []) as WorkoutPlan[];
  const completedDates = allWorkouts
    .filter((w) => w.date >= mondayStr && w.date <= sundayStr)
    .map((w) => w.date);

  const workouts     = allWorkouts.filter((w) => !/walk/i.test(w.activity));
  const walkSessions = allWorkouts.filter((w) => /walk/i.test(w.activity));

  // "Walks this week" = last 7 days
  const weekStart = daysAgoString(6);
  const walksThisWeek = walkSessions.filter((w) => w.date >= weekStart);
  const walkCount    = walksThisWeek.length;
  const walkDuration = walksThisWeek.reduce((s, w) => s + (w.duration_mins ?? 0), 0);

  const goals: Record<string, number | null> = {};
  let rawWeightUnit: string | null = null;
  for (const row of profileRes.data ?? []) {
    if (row.key === "weight_unit") {
      rawWeightUnit = row.value;
      continue;
    }
    const n = parseFloat(row.value ?? "");
    goals[row.key] = isNaN(n) ? null : n;
  }
  const weightUnit = parseWeightUnit(rawWeightUnit);

  const weeklyWorkoutGoal   = goals["weekly_workout_goal"]   ?? null;
  const weeklyActiveCalGoal = goals["weekly_active_cal_goal"] ?? null;
  const weightGoal          = goals["weight_goal_lbs"]        ?? null;
  const bodyFatGoal         = goals["body_fat_goal_pct"]      ?? null;

  const latest = fitnessData[fitnessData.length - 1] ?? null;

  type SessionWithSets = StrengthSession & { sets: StrengthSessionSet[] };
  const strengthSessions = (strengthSessionsRes.data ?? []) as SessionWithSets[];
  const todaySession = strengthSessions.find((s) => s.performed_on === todayStr) ?? null;
  const todaySets = todaySession?.sets ?? [];
  const recentSessions = strengthSessions.slice(0, 10);
  const topExercises = rankExercisesByVolume(strengthSessions, 3);

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

      {/* Weekly workout program */}
      <WeeklyWorkoutPlan
        plans={weeklyPlans}
        completedDates={completedDates}
        todaySession={todaySession}
        todaySets={todaySets}
        weightUnit={weightUnit}
      />

      {topExercises.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {topExercises.map((ex) => (
            <ExerciseSparkline
              key={ex.name}
              exerciseName={ex.name}
              points={ex.points}
              unit={weightUnit}
            />
          ))}
        </div>
      )}

      <RecentSessionsList sessions={recentSessions} unit={weightUnit} />

      {/* Body composition trend */}
      <BodyCompDualChart data={fitnessData} windowLabel={windowKey.toUpperCase()} windowKey={windowKey} />

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
          windowKey={windowKey}
        />
        <BodyFatGoalChart
          data={fitnessData}
          goal={bodyFatGoal}
          windowLabel={windowKey.toUpperCase()}
          windowKey={windowKey}
        />
      </div>

      <WorkoutHistoryTable workouts={allWorkouts} />
    </div>
  );
}

interface SparklinePoint {
  performed_on: string;
  top_weight_kg: number | null;
  top_reps: number | null;
}

function rankExercisesByVolume(
  sessions: (StrengthSession & { sets: StrengthSessionSet[] })[],
  limit: number
): { name: string; points: SparklinePoint[] }[] {
  const byExercise = new Map<string, { displayName: string; volume: number; sessionTops: Map<string, SparklinePoint> }>();

  for (const session of sessions) {
    for (const set of session.sets) {
      if (set.weight_kg == null || set.reps == null) continue;
      const key = set.exercise_name.toLowerCase();
      const bucket = byExercise.get(key) ?? {
        displayName: set.exercise_name,
        volume: 0,
        sessionTops: new Map<string, SparklinePoint>(),
      };
      bucket.volume += set.weight_kg * set.reps;
      const prevTop = bucket.sessionTops.get(session.performed_on);
      if (!prevTop || (prevTop.top_weight_kg ?? 0) < set.weight_kg) {
        bucket.sessionTops.set(session.performed_on, {
          performed_on: session.performed_on,
          top_weight_kg: set.weight_kg,
          top_reps: set.reps,
        });
      }
      byExercise.set(key, bucket);
    }
  }

  return [...byExercise.values()]
    .sort((a, b) => b.volume - a.volume)
    .slice(0, limit)
    .map((b) => ({
      name: b.displayName,
      points: [...b.sessionTops.values()].sort((a, b) =>
        a.performed_on.localeCompare(b.performed_on)
      ),
    }));
}
