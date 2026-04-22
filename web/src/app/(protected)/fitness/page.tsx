export const dynamic = "force-dynamic";

import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { daysAgoString, todayString, addDays } from "@/lib/timezone";
import { getWindow } from "@/lib/window";

export const metadata: Metadata = {
  title: "Fitness",
  description: "Body composition, recovery, sleep, and activity trends.",
};
import { WindowSelector } from "@/components/ui/window-selector";
import { FitnessClient } from "@/components/fitness/FitnessClient";
import type {
  FitnessLog,
  WorkoutSession,
  RecoveryMetrics,
  WorkoutPlan,
  StrengthSession,
  StrengthSessionSet,
  ExercisePR,
} from "@/lib/types";
import { parseWeightUnit } from "@/lib/units";
import { revalidatePath } from "next/cache";
import { cancelWorkout } from "@/lib/fitness/cancel-workout";
import { createServiceClient } from "@/lib/supabase/service";

async function cancelWorkoutPlan(date: string, reason?: string) {
  "use server";
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;
  const db = createServiceClient();
  await cancelWorkout({ supabase: db, userId: user.id, date, reason });
  revalidatePath("/fitness");
}

export default async function FitnessPage() {
  const supabase = await createClient();
  const { key: windowKey, days } = await getWindow();
  const weekCount = Math.ceil(days / 7);

  const todayStr = todayString();
  const dow = (new Date(`${todayStr}T12:00:00Z`).getUTCDay() + 6) % 7;
  const mondayStr = addDays(todayStr, -dow);
  const sundayStr = addDays(mondayStr, 6);

  const strengthSessionsSince = daysAgoString(89);
  const recoveryDays = Math.max(days, 30);

  const [
    fitnessRes,
    workoutsRes,
    recoveryRes,
    profileRes,
    weeklyPlansRes,
    strengthSessionsRes,
    exercisePRsRes,
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
      .gte("date", daysAgoString(weekCount * 7 - 1))
      .order("date", { ascending: false }),
    supabase
      .from("recovery_metrics")
      .select("*")
      .gte("date", daysAgoString(recoveryDays - 1))
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
        "rest_timer_enabled",
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
    supabase
      .from("exercise_prs")
      .select(
        "exercise_name,weight_pr_kg,rep_pr_reps,rep_pr_weight_kg,volume_pr_kg,weight_pr_achieved_at,rep_pr_achieved_at,volume_pr_achieved_at",
      ),
  ]);

  const fitnessData = (fitnessRes.data ?? []) as FitnessLog[];
  const allWorkouts = (workoutsRes.data ?? []) as WorkoutSession[];
  const recoveryAll = (recoveryRes.data ?? []) as RecoveryMetrics[];
  const weeklyPlans = (weeklyPlansRes.data ?? []) as WorkoutPlan[];
  const completedDates = allWorkouts
    .filter((w) => w.date >= mondayStr && w.date <= sundayStr)
    .map((w) => w.date);

  const walkSessions = allWorkouts.filter((w) => /walk/i.test(w.activity));
  const weekStart = daysAgoString(6);
  const walksThisWeek = walkSessions.filter((w) => w.date >= weekStart);
  const walkCount = walksThisWeek.length;
  const walkDuration = walksThisWeek.reduce((s, w) => s + (w.duration_mins ?? 0), 0);

  const goals: Record<string, number | null> = {};
  let rawWeightUnit: string | null = null;
  let rawRestTimerEnabled: string | null = null;
  for (const row of profileRes.data ?? []) {
    if (row.key === "weight_unit") {
      rawWeightUnit = row.value;
      continue;
    }
    if (row.key === "rest_timer_enabled") {
      rawRestTimerEnabled = row.value;
      continue;
    }
    const n = parseFloat(row.value ?? "");
    goals[row.key] = isNaN(n) ? null : n;
  }
  const weightUnit = parseWeightUnit(rawWeightUnit);
  const restTimerEnabled = rawRestTimerEnabled !== "0";

  const weeklyWorkoutGoal = goals["weekly_workout_goal"] ?? null;
  const weeklyActiveCalGoal = goals["weekly_active_cal_goal"] ?? null;
  const weightGoal = goals["weight_goal_lbs"] ?? null;
  const bodyFatGoal = goals["body_fat_goal_pct"] ?? null;

  const latest = fitnessData[fitnessData.length - 1] ?? null;
  const latestRecovery = recoveryAll[recoveryAll.length - 1] ?? null;

  const activeCalWindow = recoveryAll
    .filter((r) => r.date >= daysAgoString(weekCount * 7 - 1))
    .map((r) => ({ date: r.date, active_cal: r.active_cal }));

  type SessionWithSets = StrengthSession & { sets: StrengthSessionSet[] };
  const strengthSessions = (strengthSessionsRes.data ?? []) as SessionWithSets[];
  const todaySession = strengthSessions.find((s) => s.performed_on === todayStr) ?? null;
  const todaySets = todaySession?.sets ?? [];
  const recentSessions = strengthSessions.slice(0, 10);
  const topExercises = rankExercisesByVolume(strengthSessions, 3);

  const exercisePRs = (exercisePRsRes.data ?? []) as ExercisePR[];

  return (
    <div className="flex flex-col" style={{ gap: "var(--space-7)" }}>
      {/* ── Header ───────────────────────────────────────────────────── */}
      <header
        className="flex items-start justify-between flex-wrap"
        style={{ gap: "var(--space-4)" }}
      >
        <div className="flex flex-col" style={{ gap: "var(--space-2)" }}>
          <h1
            style={{
              margin: 0,
              fontFamily: "var(--font-display), system-ui, sans-serif",
              fontSize: "var(--t-h1)",
              fontWeight: 600,
              color: "var(--color-text)",
              letterSpacing: "-0.02em",
            }}
          >
            Fitness
          </h1>
          <p
            className="tnum"
            style={{
              margin: 0,
              fontSize: "var(--t-micro)",
              color: "var(--color-text-muted)",
            }}
          >
            <FitnessSubtitle
              latest={latest}
              latestRecovery={latestRecovery}
              weightUnit={weightUnit}
            />
          </p>
        </div>
        <WindowSelector current={windowKey} />
      </header>

      {/* ── Tabbed fitness surface ────────────────────────────────────── */}
      <FitnessClient
        weeklyPlans={weeklyPlans}
        completedDates={completedDates}
        todaySession={todaySession}
        todaySets={todaySets}
        weightUnit={weightUnit}
        cancelAction={cancelWorkoutPlan}
        recentSessions={recentSessions}
        fitnessData={fitnessData}
        allWorkouts={allWorkouts}
        recoveryAll={recoveryAll}
        activeCalWindow={activeCalWindow}
        topExercises={topExercises}
        walkCount={walkCount}
        walkDuration={walkDuration}
        weeklyWorkoutGoal={weeklyWorkoutGoal}
        weeklyActiveCalGoal={weeklyActiveCalGoal}
        weightGoal={weightGoal}
        bodyFatGoal={bodyFatGoal}
        windowKey={windowKey}
        days={days}
        weekCount={weekCount}
        exercisePRs={exercisePRs}
        prCount={exercisePRs.length}
        restTimerEnabled={restTimerEnabled}
      />
    </div>
  );
}

function FitnessSubtitle({
  latest,
  latestRecovery,
  weightUnit,
}: {
  latest: FitnessLog | null;
  latestRecovery: RecoveryMetrics | null;
  weightUnit: "lb" | "kg";
}) {
  const parts: string[] = [];
  if (latest) {
    if (latest.weight_lb != null) {
      parts.push(`${latest.weight_lb} ${weightUnit}`);
    }
    if (latest.body_fat_pct != null) {
      parts.push(`${latest.body_fat_pct}% body fat`);
    }
    parts.push(latest.date);
  }
  if (latestRecovery) {
    const extras: string[] = [];
    if (latestRecovery.readiness != null) {
      extras.push(`readiness ${latestRecovery.readiness}`);
    }
    if (latestRecovery.avg_hrv != null) {
      extras.push(`HRV ${Math.round(latestRecovery.avg_hrv)} ms`);
    }
    if (latestRecovery.resting_hr != null) {
      extras.push(`RHR ${Math.round(latestRecovery.resting_hr)} bpm`);
    }
    if (extras.length > 0) {
      parts.push(extras.join(" · "));
    }
  }
  if (parts.length === 0) return <>No data yet</>;
  return <>{parts.join(" · ")}</>;
}

interface SparklinePoint {
  performed_on: string;
  top_weight_kg: number | null;
  top_reps: number | null;
}

function rankExercisesByVolume(
  sessions: (StrengthSession & { sets: StrengthSessionSet[] })[],
  limit: number,
): { name: string; points: SparklinePoint[] }[] {
  const byExercise = new Map<
    string,
    {
      displayName: string;
      volume: number;
      sessionTops: Map<string, SparklinePoint>;
    }
  >();

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
        a.performed_on.localeCompare(b.performed_on),
      ),
    }));
}
