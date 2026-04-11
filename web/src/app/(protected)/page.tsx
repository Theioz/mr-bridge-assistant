export const dynamic = "force-dynamic";

import { createClient } from "@/lib/supabase/server";
import HabitsSummary from "@/components/dashboard/habits-summary";
import TasksSummary from "@/components/dashboard/tasks-summary";
import FitnessSummary from "@/components/dashboard/fitness-summary";
import RecoverySummary from "@/components/dashboard/recovery-summary";
import FunFact from "@/components/dashboard/fun-fact";
import ScheduleToday from "@/components/dashboard/schedule-today";
import ImportantEmails from "@/components/dashboard/important-emails";
import type { HabitLog, HabitRegistry, Task, FitnessLog, RecoveryMetrics, WorkoutSession } from "@/lib/types";
import { todayString, USER_TZ } from "@/lib/timezone";

function getGreeting(tz: string): string {
  const hour = parseInt(
    new Date().toLocaleString("en-US", { hour: "numeric", hour12: false, timeZone: tz })
  );
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

function readinessBadgeClass(score: number | null): string {
  if (score == null) return "";
  if (score >= 80) return "border-green-800 text-green-400 bg-green-950/40";
  if (score >= 60) return "border-amber-800 text-amber-400 bg-amber-950/40";
  return "border-red-800 text-red-400 bg-red-950/40";
}

export default async function DashboardPage() {
  const supabase = await createClient();
  const today = todayString();

  const [
    habitsResult,
    registryResult,
    tasksResult,
    fitnessResult,
    prevFitnessResult,
    recoveryResult,
    recoveryTrendsResult,
    workoutResult,
  ] = await Promise.all([
    supabase.from("habits").select("*").eq("date", today),
    supabase.from("habit_registry").select("id, name, emoji").eq("active", true),
    supabase.from("tasks").select("*").eq("status", "active"),
    supabase
      .from("fitness_log")
      .select("*")
      .not("body_fat_pct", "is", null)
      .order("date", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("fitness_log")
      .select("*")
      .not("body_fat_pct", "is", null)
      .order("date", { ascending: false })
      .range(1, 1)
      .maybeSingle(),
    supabase
      .from("recovery_metrics")
      .select("*")
      .not("avg_hrv", "is", null)
      .order("date", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("recovery_metrics")
      .select("date, avg_hrv, readiness, total_sleep_hrs, light_hrs, deep_hrs, rem_hrs")
      .order("date", { ascending: false })
      .limit(14),
    supabase
      .from("workout_sessions")
      .select("*")
      .order("date", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const todayHabits = (habitsResult.data ?? []) as HabitLog[];
  const habitRegistry = (registryResult.data ?? []) as Pick<HabitRegistry, "id" | "name" | "emoji">[];
  const totalHabits = habitRegistry.length;
  const tasks = (tasksResult.data ?? []) as Task[];
  const latestFitness = fitnessResult.data as FitnessLog | null;
  const prevFitness = prevFitnessResult.data as FitnessLog | null;
  const recovery = recoveryResult.data as RecoveryMetrics | null;
  const recoveryTrends = ((recoveryTrendsResult.data ?? []) as RecoveryMetrics[]).reverse();
  const recentWorkout = workoutResult.data as WorkoutSession | null;

  const greeting = getGreeting(USER_TZ);
  const dateStr = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone: USER_TZ,
  });

  return (
    <div className="space-y-5">
      {/* Fun fact banner */}
      <FunFact />

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-neutral-100">{greeting}</h1>
          <p className="text-sm text-neutral-500 mt-0.5">{dateStr}</p>
        </div>
        {recovery?.readiness != null && (
          <span className={`text-xs font-[family-name:var(--font-mono)] px-2.5 py-1 rounded-lg border ${readinessBadgeClass(recovery.readiness)}`}>
            Readiness {recovery.readiness}
          </span>
        )}
      </div>

      {/* Bento grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Recovery — 2/3 width */}
        <div className="lg:col-span-2">
          <RecoverySummary recovery={recovery} trends={recoveryTrends} />
        </div>

        {/* Right sidebar: Habits + Tasks stacked */}
        <div className="flex flex-col gap-4">
          <HabitsSummary habits={todayHabits} total={totalHabits} registry={habitRegistry} />
          <TasksSummary tasks={tasks} />
        </div>

        {/* Row 2: Schedule (1 col) + Fitness (2 col) */}
        <div className="lg:col-span-1">
          <ScheduleToday />
        </div>
        <div className="lg:col-span-2">
          <FitnessSummary latest={latestFitness} previous={prevFitness} recentWorkout={recentWorkout} />
        </div>

        {/* Row 3: Emails — full width */}
        <div className="lg:col-span-3">
          <ImportantEmails />
        </div>
      </div>

    </div>
  );
}
