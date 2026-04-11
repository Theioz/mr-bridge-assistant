export const dynamic = "force-dynamic";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { Suspense } from "react";
import HabitHistory from "@/components/habits/habit-history";
import HabitTodaySection from "@/components/habits/habit-today-section";
import HabitRangeToggle from "@/components/habits/habit-range-toggle";
import type { HabitRegistry, HabitLog } from "@/lib/types";
import { todayString, getLastNDays, daysAgoString } from "@/lib/timezone";

async function toggleHabit(habitId: string, date: string, completed: boolean) {
  "use server";
  const supabase = await createClient();
  await supabase
    .from("habits")
    .upsert({ habit_id: habitId, date, completed }, { onConflict: "habit_id,date" });
  revalidatePath("/habits");
  revalidatePath("/");
}

async function addHabit(name: string, emoji: string, category: string) {
  "use server";
  const supabase = await createClient();
  await supabase.from("habit_registry").insert({
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
  revalidatePath("/");
}

const VALID_RANGES = [7, 30, 90] as const;
type Range = (typeof VALID_RANGES)[number];

export default async function HabitsPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string }>;
}) {
  const params = await searchParams;
  const rawRange = Number(params.range ?? 30);
  const range: Range = (VALID_RANGES as readonly number[]).includes(rawRange)
    ? (rawRange as Range)
    : 30;

  const supabase = await createClient();
  const today = todayString();
  const historyDates = getLastNDays(range);

  const [registryResult, todayLogsResult, historyLogsResult] = await Promise.all([
    supabase.from("habit_registry").select("*").eq("active", true).order("category").order("name"),
    supabase.from("habits").select("*").eq("date", today),
    range === 90
      ? supabase
          .from("habits")
          .select("*")
          .gte("date", daysAgoString(89))
          .lte("date", today)
      : supabase.from("habits").select("*").in("date", historyDates),
  ]);

  const habits = (registryResult.data ?? []) as HabitRegistry[];
  const todayLogs = (todayLogsResult.data ?? []) as HabitLog[];
  const historyLogs = (historyLogsResult.data ?? []) as HabitLog[];

  const completed = todayLogs.filter((l) => l.completed).length;

  return (
    <div className="pt-8 space-y-8">
      <div>
        <h1 className="text-xl font-semibold text-neutral-100">Habits</h1>
        <p className="text-sm text-neutral-500 mt-0.5">
          {completed} / {habits.length} today
        </p>
      </div>

      <HabitTodaySection
        habits={habits}
        todayLogs={todayLogs}
        date={today}
        toggleAction={toggleHabit}
        archiveAction={archiveHabit}
        addAction={addHabit}
      />

      {habits.length > 0 && (
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xs text-neutral-500 uppercase tracking-wide">History</h2>
            <Suspense fallback={null}>
              <HabitRangeToggle current={range} />
            </Suspense>
          </div>
          <HabitHistory habits={habits} logs={historyLogs} dates={historyDates} range={range} />
        </section>
      )}
    </div>
  );
}
