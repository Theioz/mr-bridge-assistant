export const dynamic = "force-dynamic";

import { createClient } from "@/lib/supabase/server";
import { daysAgoString } from "@/lib/timezone";
import { getWindow } from "@/lib/window";
import { WindowSelector } from "@/components/ui/window-selector";
import { BodyCompDualChart } from "@/components/fitness/body-comp-dual-chart";
import { WorkoutFreqChart } from "@/components/fitness/workout-freq-chart";
import { ActiveCalChart } from "@/components/fitness/active-cal-chart";
import { WorkoutHistoryTable } from "@/components/fitness/workout-history-table";
import type { FitnessLog, WorkoutSession, RecoveryMetrics } from "@/lib/types";

export default async function FitnessPage() {
  const supabase = await createClient();
  const { key: windowKey, days } = await getWindow();
  const weekCount = Math.max(1, Math.ceil(days / 7));

  const [fitnessRes, workoutsRes, recoveryRes] = await Promise.all([
    supabase
      .from("fitness_log")
      .select("*")
      .not("body_fat_pct", "is", null)
      .gte("date", daysAgoString(days - 1))
      .order("date", { ascending: true }),
    supabase
      .from("workout_sessions")
      .select("*")
      .gte("date", daysAgoString(days - 1))
      .order("date", { ascending: false }),
    supabase
      .from("recovery_metrics")
      .select("date,active_cal")
      .gte("date", daysAgoString(days - 1))
      .order("date", { ascending: true }),
  ]);

  const fitnessData = (fitnessRes.data ?? []) as FitnessLog[];
  const workouts = (workoutsRes.data ?? []) as WorkoutSession[];
  const recoveryData = (recoveryRes.data ?? []) as Pick<RecoveryMetrics, "date" | "active_cal">[];

  const latest = fitnessData[fitnessData.length - 1] ?? null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-heading font-semibold" style={{ fontSize: 24, color: "var(--color-text)" }}>
            Fitness
          </h1>
          {latest && (
            <p className="mt-1" style={{ fontSize: 14, color: "var(--color-text-muted)" }}>
              {latest.weight_lb} lb · {latest.body_fat_pct}% body fat · {latest.date}
            </p>
          )}
        </div>
        <WindowSelector current={windowKey} />
      </div>

      <BodyCompDualChart data={fitnessData} windowLabel={windowKey.toUpperCase()} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <WorkoutFreqChart sessions={workouts} weekCount={weekCount} />
        <ActiveCalChart data={recoveryData} windowLabel={windowKey.toUpperCase()} />
      </div>

      <WorkoutHistoryTable workouts={workouts} />
    </div>
  );
}
