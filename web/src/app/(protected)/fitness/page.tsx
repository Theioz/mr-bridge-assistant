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
import { BodyCompTrends } from "@/components/fitness/body-comp-trends";
import { RecoveryTrends } from "@/components/fitness/recovery-trends";
import { ActivityTrends } from "@/components/fitness/activity-trends";
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
import { revalidatePath } from "next/cache";
import { cancelWorkout } from "@/lib/fitness/cancel-workout";
import { createServiceClient } from "@/lib/supabase/service";

async function cancelWorkoutPlan(date: string, reason?: string) {
  "use server";
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  const db = createServiceClient();
  await cancelWorkout({ supabase: db, userId: user.id, date, reason });
  revalidatePath("/fitness");
}

export default async function FitnessPage() {
  const supabase = await createClient();
  const { key: windowKey, days } = await getWindow();
  const weekCount = Math.ceil(days / 7);

  // Current ISO week bounds (Mon–Sun) in user's local timezone
  const todayStr = todayString();
  const dow = (new Date(`${todayStr}T12:00:00Z`).getUTCDay() + 6) % 7;
  const mondayStr = addDays(todayStr, -dow);
  const sundayStr = addDays(mondayStr, 6);

  const strengthSessionsSince = daysAgoString(89);
  // Recovery-trend window: always at least 30 days so HRV / RHR panels stay
  // populated even when the user picks a 7d or 14d top-level range.
  const recoveryDays = Math.max(days, 30);

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
  const recoveryAll = (recoveryRes.data ?? []) as RecoveryMetrics[];
  const weeklyPlans = (weeklyPlansRes.data ?? []) as WorkoutPlan[];
  const completedDates = allWorkouts
    .filter((w) => w.date >= mondayStr && w.date <= sundayStr)
    .map((w) => w.date);

  const workouts = allWorkouts.filter((w) => !/walk/i.test(w.activity));
  const walkSessions = allWorkouts.filter((w) => /walk/i.test(w.activity));
  const weekStart = daysAgoString(6);
  const walksThisWeek = walkSessions.filter((w) => w.date >= weekStart);
  const walkCount = walksThisWeek.length;
  const walkDuration = walksThisWeek.reduce(
    (s, w) => s + (w.duration_mins ?? 0),
    0
  );

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

  const weeklyWorkoutGoal = goals["weekly_workout_goal"] ?? null;
  const weeklyActiveCalGoal = goals["weekly_active_cal_goal"] ?? null;
  const weightGoal = goals["weight_goal_lbs"] ?? null;
  const bodyFatGoal = goals["body_fat_goal_pct"] ?? null;

  const latest = fitnessData[fitnessData.length - 1] ?? null;
  const latestRecovery = recoveryAll[recoveryAll.length - 1] ?? null;

  // Active-cal chart is scoped to the top-level window; recovery panels
  // always lean on the 30-day slice.
  const activeCalWindow = recoveryAll
    .filter((r) => r.date >= daysAgoString(weekCount * 7 - 1))
    .map((r) => ({ date: r.date, active_cal: r.active_cal }));

  type SessionWithSets = StrengthSession & { sets: StrengthSessionSet[] };
  const strengthSessions = (strengthSessionsRes.data ?? []) as SessionWithSets[];
  const todaySession = strengthSessions.find((s) => s.performed_on === todayStr) ?? null;
  const todaySets = todaySession?.sets ?? [];
  const recentSessions = strengthSessions.slice(0, 10);
  const topExercises = rankExercisesByVolume(strengthSessions, 3);

  return (
    <div
      className="flex flex-col"
      style={{ gap: "var(--space-7)" }}
    >
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

      {/* ── Weekly program ───────────────────────────────────────────── */}
      <WeeklyWorkoutPlan
        plans={weeklyPlans}
        completedDates={completedDates}
        todaySession={todaySession}
        todaySets={todaySets}
        weightUnit={weightUnit}
        cancelAction={cancelWorkoutPlan}
      />

      {/* ── Top exercises ────────────────────────────────────────────── */}
      {topExercises.length > 0 && (
        <section
          className="flex flex-col"
          style={{ gap: "var(--space-3)", minWidth: 0 }}
        >
          <h2
            style={{
              margin: 0,
              fontFamily: "var(--font-display), system-ui, sans-serif",
              fontSize: "var(--t-h2)",
              fontWeight: 600,
              color: "var(--color-text)",
              letterSpacing: "-0.01em",
            }}
          >
            Top exercises
          </h2>
          <div
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3"
            style={{ gap: "var(--space-5)" }}
          >
            {topExercises.map((ex) => (
              <ExerciseSparkline
                key={ex.name}
                exerciseName={ex.name}
                points={ex.points}
                unit={weightUnit}
              />
            ))}
          </div>
        </section>
      )}

      {/* ── Recent sessions ──────────────────────────────────────────── */}
      <RecentSessionsList sessions={recentSessions} unit={weightUnit} />

      {/* ── Body composition ─────────────────────────────────────────── */}
      <BodyCompTrends
        data={fitnessData}
        windowKey={windowKey}
        weightGoal={weightGoal}
        bodyFatGoal={bodyFatGoal}
      />

      {/* ── Recovery + sleep ─────────────────────────────────────────── */}
      <RecoveryTrends trends={recoveryAll} />

      {/* ── Activity ─────────────────────────────────────────────────── */}
      <ActivityTrends
        sessions={workouts}
        recovery={activeCalWindow}
        days={days}
        weeklyWorkoutGoal={weeklyWorkoutGoal}
        weeklyActiveCalGoal={weeklyActiveCalGoal}
        walkCount={walkCount}
        walkDuration={walkDuration}
      />

      {/* ── Workout history ──────────────────────────────────────────── */}
      <WorkoutHistoryTable workouts={allWorkouts} />
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
  limit: number
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
        a.performed_on.localeCompare(b.performed_on)
      ),
    }));
}
