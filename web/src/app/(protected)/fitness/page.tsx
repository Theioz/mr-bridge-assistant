export const dynamic = "force-dynamic";

import { createClient } from "@/lib/supabase/server";
import BodyCompChart from "@/components/fitness/body-comp-chart";
import WorkoutList from "@/components/fitness/workout-list";
import type { FitnessLog, WorkoutSession } from "@/lib/types";

export default async function FitnessPage() {
  const supabase = await createClient();

  const [fitnessResult, workoutsResult] = await Promise.all([
    supabase
      .from("fitness_log")
      .select("*")
      .not("body_fat_pct", "is", null)
      .order("date", { ascending: false })
      .limit(30),
    supabase
      .from("workout_sessions")
      .select("*")
      .order("date", { ascending: false })
      .limit(10),
  ]);

  const fitnessData = ((fitnessResult.data ?? []) as FitnessLog[]).reverse();
  const workouts = (workoutsResult.data ?? []) as WorkoutSession[];
  const latest = fitnessData[fitnessData.length - 1] ?? null;

  return (
    <div className="pt-8 space-y-8">
      <div>
        <h1 className="text-xl font-semibold text-neutral-100">Fitness</h1>
        {latest && (
          <p className="text-sm text-neutral-500 mt-0.5">
            {latest.weight_lb} lb · {latest.body_fat_pct}% body fat · {latest.date}
          </p>
        )}
      </div>

      <section>
        <h2 className="text-xs text-neutral-500 uppercase tracking-wide mb-4">Body composition (30 days)</h2>
        <BodyCompChart data={fitnessData} />
      </section>

      <section>
        <h2 className="text-xs text-neutral-500 uppercase tracking-wide mb-4">Recent workouts</h2>
        <WorkoutList workouts={workouts} />
      </section>
    </div>
  );
}
