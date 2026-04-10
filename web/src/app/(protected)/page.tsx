import { createClient } from "@/lib/supabase/server";
import HabitsSummary from "@/components/dashboard/habits-summary";
import TasksSummary from "@/components/dashboard/tasks-summary";
import FitnessSummary from "@/components/dashboard/fitness-summary";
import RecentChat from "@/components/dashboard/recent-chat";
import type { HabitLog, Task, FitnessLog, ChatMessage } from "@/lib/types";

export default async function DashboardPage() {
  const supabase = await createClient();
  const today = new Date().toISOString().split("T")[0];

  const [habitsResult, registryResult, tasksResult, fitnessResult, prevFitnessResult, chatResult] =
    await Promise.all([
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
        .from("chat_messages")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

  const todayHabits = (habitsResult.data ?? []) as HabitLog[];
  const totalHabits = registryResult.data?.length ?? 0;
  const tasks = (tasksResult.data ?? []) as Task[];
  const latestFitness = fitnessResult.data as FitnessLog | null;
  const prevFitness = prevFitnessResult.data as FitnessLog | null;
  const recentMessage = chatResult.data as ChatMessage | null;

  const dateStr = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  return (
    <div className="pt-8 pb-4 space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-neutral-100">Dashboard</h1>
        <p className="text-sm text-neutral-500 mt-0.5">{dateStr}</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <HabitsSummary habits={todayHabits} total={totalHabits} />
        <TasksSummary tasks={tasks} />
        <FitnessSummary latest={latestFitness} previous={prevFitness} />
        <RecentChat message={recentMessage} />
      </div>
    </div>
  );
}
