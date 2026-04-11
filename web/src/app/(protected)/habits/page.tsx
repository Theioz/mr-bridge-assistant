export const dynamic = "force-dynamic";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import HabitToggle from "@/components/habits/habit-toggle";
import HabitHistory from "@/components/habits/habit-history";
import type { HabitRegistry, HabitLog } from "@/lib/types";
import { todayString, getLast7Days } from "@/lib/timezone";

async function toggleHabit(habitId: string, date: string, completed: boolean) {
  "use server";
  const supabase = await createClient();
  await supabase
    .from("habits")
    .upsert({ habit_id: habitId, date, completed }, { onConflict: "habit_id,date" });
  revalidatePath("/habits");
  revalidatePath("/");
}

export default async function HabitsPage() {
  const supabase = await createClient();
  const today = todayString();
  const last7 = getLast7Days();

  const [registryResult, todayLogsResult, historyLogsResult] = await Promise.all([
    supabase.from("habit_registry").select("*").eq("active", true).order("category").order("name"),
    supabase.from("habits").select("*").eq("date", today),
    supabase.from("habits").select("*").in("date", last7),
  ]);

  const habits = (registryResult.data ?? []) as HabitRegistry[];
  const todayLogs = (todayLogsResult.data ?? []) as HabitLog[];
  const historyLogs = (historyLogsResult.data ?? []) as HabitLog[];
  const todayLogMap = new Map(todayLogs.map((l) => [l.habit_id, l]));

  const completed = todayLogs.filter((l) => l.completed).length;

  return (
    <div className="pt-8 space-y-8">
      <div>
        <h1 className="text-xl font-semibold text-neutral-100">Habits</h1>
        <p className="text-sm text-neutral-500 mt-0.5">
          {completed} / {habits.length} today
        </p>
      </div>

      <section>
        <h2 className="text-xs text-neutral-500 uppercase tracking-wide mb-3">Today</h2>
        <div className="divide-y divide-neutral-800/50">
          {habits.map((habit) => (
            <HabitToggle
              key={habit.id}
              habit={habit}
              log={todayLogMap.get(habit.id)}
              toggleAction={toggleHabit}
              date={today}
            />
          ))}
          {habits.length === 0 && (
            <p className="text-sm text-neutral-600 py-4">No habits configured.</p>
          )}
        </div>
      </section>

      {habits.length > 0 && (
        <section>
          <h2 className="text-xs text-neutral-500 uppercase tracking-wide mb-3">Last 7 days</h2>
          <HabitHistory habits={habits} logs={historyLogs} dates={last7} />
        </section>
      )}
    </div>
  );
}
