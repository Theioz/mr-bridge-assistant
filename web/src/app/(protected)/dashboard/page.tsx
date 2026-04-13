export const dynamic = "force-dynamic";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { todayString, daysAgoString, USER_TZ } from "@/lib/timezone";
import { computeStreaks } from "@/lib/streaks";
import { getWindow } from "@/lib/window";
import DashboardHeader from "@/components/dashboard/dashboard-header";
import HealthBreakdown from "@/components/dashboard/health-breakdown";
import TodayScoresStrip from "@/components/dashboard/today-scores-strip";
import HabitsCheckin from "@/components/dashboard/habits-checkin";
import UpcomingBirthdayWidget from "@/components/dashboard/upcoming-birthday";
import ScheduleToday from "@/components/dashboard/schedule-today";
import ImportantEmails from "@/components/dashboard/important-emails";
import TasksSummary from "@/components/dashboard/tasks-summary";
import type { HabitLog, HabitRegistry, FitnessLog, RecoveryMetrics, Task } from "@/lib/types";

async function toggleHabit(habitId: string, date: string, completed: boolean) {
  "use server";
  const supabase = await createClient();
  await supabase
    .from("habits")
    .upsert({ habit_id: habitId, date, completed }, { onConflict: "habit_id,date" });
  revalidatePath("/dashboard");
}

export default async function DashboardPage() {
  const supabase = await createClient();
  const today = todayString();
  const { key: windowKey, days } = await getWindow();

  const [
    fitnessLatestRes,
    fitnessTrendRes,
    recoveryLatestRes,
    todayRecoveryRes,
    recoveryTrendsRes,
    habitRegistryRes,
    todayHabitsRes,
    allCompletedRes,
    profileRes,
    tasksRes,
  ] = await Promise.all([
    // Latest 2 rows with body fat (for delta calculations)
    supabase
      .from("fitness_log")
      .select("date,weight_lb,body_fat_pct")
      .not("body_fat_pct", "is", null)
      .order("date", { ascending: false })
      .limit(2),
    // Windowed weight + body fat trend
    supabase
      .from("fitness_log")
      .select("date,weight_lb,body_fat_pct")
      .gte("date", daysAgoString(days - 1))
      .order("date", { ascending: true }),
    // Latest full recovery row — capped to before today so a partial same-day
    // sync row does not replace yesterday's complete data in Health Breakdown
    supabase
      .from("recovery_metrics")
      .select("*")
      .lt("date", today)
      .order("date", { ascending: false })
      .limit(1),
    // Today's scores only (for the strip above Health Breakdown)
    supabase
      .from("recovery_metrics")
      .select("date,readiness,sleep_score,source")
      .eq("date", today)
      .limit(1),
    // Windowed recovery trend (HRV, sleep stages, steps, calories, RHR, SpO2)
    supabase
      .from("recovery_metrics")
      .select("*")
      .gte("date", daysAgoString(days - 1))
      .order("date", { ascending: true }),
    supabase.from("habit_registry").select("id,name,emoji").eq("active", true),
    supabase.from("habits").select("*").eq("date", today),
    supabase
      .from("habits")
      .select("habit_id,date")
      .eq("completed", true)
      .order("date", { ascending: false }),
    supabase.from("profile").select("key,value").in("key", ["name", "Identity/Name"]),
    supabase
      .from("tasks")
      .select("*")
      .is("parent_id", null)
      .eq("status", "active")
      .order("created_at", { ascending: false }),
  ]);

  // ── Wrangling ──────────────────────────────────────────────────────────────
  const fitnessRows = (fitnessLatestRes.data ?? []) as Pick<FitnessLog, "date" | "weight_lb" | "body_fat_pct">[];

  const latestRecovery = ((recoveryLatestRes.data ?? [])[0] ?? null) as RecoveryMetrics | null;
  const todayRecoveryRow = (todayRecoveryRes.data ?? [])[0] ?? null;
  // Hide the strip when today's row IS the latest card (avoid duplicate display)
  const todayScores =
    todayRecoveryRow && todayRecoveryRow.date !== latestRecovery?.date
      ? (todayRecoveryRow as Pick<RecoveryMetrics, "date" | "readiness" | "sleep_score" | "source">)
      : null;
  const recoveryTrends = (recoveryTrendsRes.data ?? []) as RecoveryMetrics[];

  const fitnessData = (fitnessTrendRes.data ?? []) as { date: string; weight_lb: number | null; body_fat_pct: number | null }[];

  const habitRegistry = (habitRegistryRes.data ?? []) as Pick<HabitRegistry, "id" | "name" | "emoji">[];
  const todayLogs     = (todayHabitsRes.data ?? []) as HabitLog[];
  const allCompleted  = (allCompletedRes.data ?? []) as { habit_id: string; date: string }[];
  const habitStreaks  = computeStreaks(allCompleted, today);

  const tasks = ((tasksRes.data ?? []) as Task[]).sort(
    (a, b) =>
      ({ high: 0, medium: 1, low: 2 }[a.priority ?? "low"] ?? 2) -
      ({ high: 0, medium: 1, low: 2 }[b.priority ?? "low"] ?? 2)
  );

  const nameRows = (profileRes.data ?? []) as { key: string; value: string }[];
  const userName =
    nameRows.find((r) => r.key === "name")?.value ??
    nameRows.find((r) => r.key === "Identity/Name")?.value ??
    null;

  const hour = parseInt(
    new Date().toLocaleString("en-US", { hour: "numeric", hour12: false, timeZone: USER_TZ })
  );
  const timeOfDay = hour < 12 ? "Morning" : hour < 17 ? "Afternoon" : "Evening";
  const greeting  = userName ? `${timeOfDay}, ${userName}` : `Good ${timeOfDay}`;

  const dateStr = new Date().toLocaleDateString("en-US", {
    weekday: "long", month: "long", day: "numeric", timeZone: USER_TZ,
  });

  return (
    <div className="space-y-6">

      {/* ── Header: greeting + date + weather + sync + window ───────── */}
      <DashboardHeader greeting={greeting} dateStr={dateStr} windowKey={windowKey} />

      {/* ── Birthday (conditionally rendered inside the widget) ──────── */}
      <UpcomingBirthdayWidget />

      {/* ── Today's scores strip (readiness + sleep, when today ≠ latest card) ── */}
      {todayScores && <TodayScoresStrip today={todayScores} />}

      {/* ── Health Breakdown: full-width, readiness + tabbed charts ─── */}
      <HealthBreakdown
        recovery={latestRecovery}
        trends={recoveryTrends}
        fitnessData={fitnessData}
        windowLabel={windowKey.toUpperCase()}
      />

      {/* ── Habits + Tasks: fixed height, scrollable ─────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <HabitsCheckin
          registry={habitRegistry}
          todayLogs={todayLogs}
          streaks={habitStreaks}
          toggleAction={toggleHabit}
          date={today}
        />
        <TasksSummary tasks={tasks} />
      </div>

      {/* ── Schedule + Emails ────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ScheduleToday />
        <ImportantEmails />
      </div>

    </div>
  );
}
