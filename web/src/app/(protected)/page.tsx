export const dynamic = "force-dynamic";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import HabitsCheckin from "@/components/dashboard/habits-checkin";
import TasksSummary from "@/components/dashboard/tasks-summary";
import TrendsCard from "@/components/dashboard/trends-card";
import RecoverySummary from "@/components/dashboard/recovery-summary";
import FunFact from "@/components/dashboard/fun-fact";
import ScheduleToday from "@/components/dashboard/schedule-today";
import ImportantEmails from "@/components/dashboard/important-emails";
import type { HabitLog, HabitRegistry, Task, FitnessLog, RecoveryMetrics, WorkoutSession } from "@/lib/types";
import { todayString, USER_TZ } from "@/lib/timezone";
import { computeStreaks } from "@/lib/streaks";

async function toggleHabit(habitId: string, date: string, completed: boolean) {
  "use server";
  const supabase = await createClient();
  await supabase
    .from("habits")
    .upsert({ habit_id: habitId, date, completed }, { onConflict: "habit_id,date" });
  revalidatePath("/");
}

function getGreeting(tz: string): string {
  const hour = parseInt(
    new Date().toLocaleString("en-US", { hour: "numeric", hour12: false, timeZone: tz })
  );
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

export default async function DashboardPage() {
  const supabase = await createClient();
  const today = todayString();

  const [
    habitsResult,
    registryResult,
    allHabitsResult,
    tasksResult,
    recoveryResult,
    recoveryTrendsResult,
    fitnessTrendsResult,
    workoutResult,
  ] = await Promise.all([
    supabase.from("habits").select("*").eq("date", today),
    supabase.from("habit_registry").select("id, name, emoji").eq("active", true),
    supabase.from("habits").select("habit_id, date").eq("completed", true),
    supabase.from("tasks").select("*").eq("status", "active"),
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
      .limit(90),
    supabase
      .from("fitness_log")
      .select("date, weight_lb, body_fat_pct")
      .not("body_fat_pct", "is", null)
      .order("date", { ascending: true })
      .limit(90),
    supabase
      .from("workout_sessions")
      .select("*")
      .order("date", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const todayHabits = (habitsResult.data ?? []) as HabitLog[];
  const habitRegistry = (registryResult.data ?? []) as Pick<HabitRegistry, "id" | "name" | "emoji">[];
  const allCompletedHabits = (allHabitsResult.data ?? []) as { habit_id: string; date: string }[];
  const habitStreaks = computeStreaks(allCompletedHabits, today);
  const tasks = (tasksResult.data ?? []) as Task[];
  const recovery = recoveryResult.data as RecoveryMetrics | null;
  const recoveryTrends = ((recoveryTrendsResult.data ?? []) as RecoveryMetrics[]).reverse();
  const fitnessTrends = (fitnessTrendsResult.data ?? []) as FitnessLog[];
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
      <div>
        <h1 className="text-xl font-semibold text-neutral-100">{greeting}</h1>
        <p className="text-sm text-neutral-500 mt-0.5">{dateStr}</p>
      </div>

      {/* Bento grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Recovery detail — 2/3 width */}
        <div className="lg:col-span-2">
          <RecoverySummary recovery={recovery} trends={recoveryTrends.slice(-14)} />
        </div>

        {/* Right sidebar: Habits check-in + Tasks stacked */}
        <div className="flex flex-col gap-4">
          <HabitsCheckin
            registry={habitRegistry}
            todayLogs={todayHabits}
            streaks={habitStreaks}
            toggleAction={toggleHabit}
            date={today}
          />
          <TasksSummary tasks={tasks} />
        </div>

        {/* Row 2: Trends — full width */}
        <div className="lg:col-span-3">
          <TrendsCard fitnessData={fitnessTrends} recoveryData={recoveryTrends} recentWorkout={recentWorkout} />
        </div>

        {/* Row 3: Schedule — full width */}
        <div className="lg:col-span-3">
          <ScheduleToday />
        </div>

        {/* Row 4: Emails — full width */}
        <div className="lg:col-span-3">
          <ImportantEmails />
        </div>
      </div>

    </div>
  );
}
