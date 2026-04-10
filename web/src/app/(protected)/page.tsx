import { createClient } from "@/lib/supabase/server";
import HabitsSummary from "@/components/dashboard/habits-summary";
import TasksSummary from "@/components/dashboard/tasks-summary";
import FitnessSummary from "@/components/dashboard/fitness-summary";
import RecoverySummary from "@/components/dashboard/recovery-summary";
import FunFact from "@/components/dashboard/fun-fact";
import ScheduleToday from "@/components/dashboard/schedule-today";
import ImportantEmails from "@/components/dashboard/important-emails";
import type { HabitLog, Task, FitnessLog, RecoveryMetrics, WorkoutSession } from "@/lib/types";
import { todayString, USER_TZ } from "@/lib/timezone";

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
    workoutResult,
  ] = await Promise.all([
    supabase.from("habits").select("*").eq("date", today),
    supabase.from("habit_registry").select("id").eq("active", true),
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
      .order("date", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("workout_sessions")
      .select("*")
      .order("date", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const todayHabits = (habitsResult.data ?? []) as HabitLog[];
  const totalHabits = registryResult.data?.length ?? 0;
  const tasks = (tasksResult.data ?? []) as Task[];
  const latestFitness = fitnessResult.data as FitnessLog | null;
  const prevFitness = prevFitnessResult.data as FitnessLog | null;
  const recovery = recoveryResult.data as RecoveryMetrics | null;
  const recentWorkout = workoutResult.data as WorkoutSession | null;

  const dateStr = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone: USER_TZ,
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-neutral-100">Good morning</h1>
        <p className="text-sm text-neutral-500 mt-0.5">{dateStr}</p>
      </div>

      <FunFact />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Left column */}
        <div className="space-y-4">
          <ScheduleToday />
          <ImportantEmails />
        </div>

        {/* Right column */}
        <div className="space-y-4">
          <RecoverySummary recovery={recovery} />
          <FitnessSummary latest={latestFitness} previous={prevFitness} recentWorkout={recentWorkout} />
          <HabitsSummary habits={todayHabits} total={totalHabits} />
          <TasksSummary tasks={tasks} />
        </div>
      </div>
    </div>
  );
}
