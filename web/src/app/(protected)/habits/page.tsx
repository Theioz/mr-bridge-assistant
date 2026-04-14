export const dynamic = "force-dynamic";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { HabitHeatmap } from "@/components/habits/heatmap";
import { StreakChart } from "@/components/habits/streak-chart";
import { RadialCompletion } from "@/components/habits/radial-completion";
import HabitHistory from "@/components/habits/habit-history";
import HabitTodaySection from "@/components/habits/habit-today-section";
import { WindowSelector } from "@/components/ui/window-selector";
import type { HabitRegistry, HabitLog } from "@/lib/types";
import { todayString, getLastNDays, daysAgoString } from "@/lib/timezone";
import { computeStreaks } from "@/lib/streaks";
import { getWindow } from "@/lib/window";

async function toggleHabit(habitId: string, date: string, completed: boolean) {
  "use server";
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  if (completed) {
    await supabase
      .from("habits")
      .upsert({ user_id: user.id, habit_id: habitId, date, completed: true }, { onConflict: "habit_id,date" });
  } else {
    await supabase
      .from("habits")
      .delete()
      .eq("habit_id", habitId)
      .eq("date", date);
  }
  revalidatePath("/habits");
  revalidatePath("/dashboard");
}

async function addHabit(name: string, emoji: string, category: string) {
  "use server";
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  await supabase.from("habit_registry").insert({
    user_id: user.id,
    name: name.trim(),
    emoji: emoji.trim() || null,
    category: category.trim() || null,
  });
  revalidatePath("/habits");
}

async function archiveHabit(habitId: string) {
  "use server";
  const supabase = await createClient();
  await supabase.from("habit_registry").update({ active: false }).eq("id", habitId);
  revalidatePath("/habits");
  revalidatePath("/dashboard");
}

async function updateHabit(id: string, name: string, emoji: string, category: string) {
  "use server";
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  await supabase
    .from("habit_registry")
    .update({
      name: name.trim(),
      emoji: emoji.trim() || null,
      category: category.trim() || null,
    })
    .eq("id", id)
    .eq("user_id", user.id);
  revalidatePath("/habits");
}

export default async function HabitsPage() {
  const supabase = await createClient();
  const today = todayString();
  const { key: windowKey, days } = await getWindow();

  // History dates for the table — cap at 90 for display sanity
  const historyDays = Math.min(days, 90);
  const historyDates = getLastNDays(historyDays);

  const [registryResult, allRegistryResult, todayLogsResult, historyLogsResult, allCompletedResult, weekLogsResult] =
    await Promise.all([
      supabase.from("habit_registry").select("*").eq("active", true).order("category").order("name"),
      supabase.from("habit_registry").select("*"),
      supabase.from("habits").select("*").eq("date", today),
      // Window-based history
      supabase
        .from("habits")
        .select("*")
        .gte("date", daysAgoString(days - 1))
        .lte("date", today),
      // All completed habits for streak computation (all time)
      supabase
        .from("habits")
        .select("habit_id,date")
        .eq("completed", true)
        .order("date", { ascending: false }),
      // Last 7 days for radial completion chart
      supabase
        .from("habits")
        .select("*")
        .gte("date", daysAgoString(6))
        .lte("date", today),
    ]);

  const habits = (registryResult.data ?? []) as HabitRegistry[];
  const allRegistry = (allRegistryResult.data ?? []) as HabitRegistry[];
  const todayLogs = (todayLogsResult.data ?? []) as HabitLog[];
  const historyLogs = (historyLogsResult.data ?? []) as HabitLog[];
  const allCompleted = (allCompletedResult.data ?? []) as { habit_id: string; date: string }[];
  const weekLogs = (weekLogsResult.data ?? []) as HabitLog[];

  const streaks = computeStreaks(allCompleted, today);
  const completed = todayLogs.filter((l) => l.completed).length;

  // Dates for heatmap — use window (capped at 365)
  const heatmapDays = Math.min(days, 365);
  const heatmapDates = getLastNDays(heatmapDays);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-heading font-semibold" style={{ fontSize: 24, color: "var(--color-text)" }}>
            Habits
          </h1>
          <p className="mt-1" style={{ fontSize: 14, color: "var(--color-text-muted)" }}>
            {completed} / {habits.length} today
          </p>
        </div>
        <WindowSelector current={windowKey} />
      </div>

      {/* Today's habits */}
      <HabitTodaySection
        habits={habits}
        todayLogs={todayLogs}
        date={today}
        toggleAction={toggleHabit}
        archiveAction={archiveHabit}
        addAction={addHabit}
        updateAction={updateHabit}
      />

      {habits.length > 0 && (
        <>
          {/* Charts: Heatmap (2/3) + Radial (1/3) */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="lg:col-span-2">
              <HabitHeatmap habits={habits} registry={allRegistry} logs={historyLogs} dates={heatmapDates} />
            </div>
            <div>
              <RadialCompletion habits={habits} weekLogs={weekLogs} />
            </div>
          </div>

          {/* Streak chart */}
          <StreakChart habits={habits} streaks={streaks} />

          {/* History grid */}
          <section>
            <p
              className="text-xs uppercase tracking-widest mb-3"
              style={{ color: "var(--color-text-muted)", letterSpacing: "0.07em" }}
            >
              History — {windowKey.toUpperCase()} {historyDays < days ? `(showing ${historyDays}d)` : ""}
            </p>
            <HabitHistory
              habits={habits}
              logs={historyLogs.filter((l) => historyDates.includes(l.date))}
              dates={historyDates}
              range={historyDays as 7 | 30 | 90}
              toggleAction={toggleHabit}
            />
          </section>
        </>
      )}
    </div>
  );
}
