import Link from "next/link";
import type { FitnessLog, WorkoutSession } from "@/lib/types";

interface Props {
  latest: FitnessLog | null;
  previous: FitnessLog | null;
  recentWorkout?: WorkoutSession | null;
}

function delta(current: number | null, prev: number | null) {
  if (current == null || prev == null) return null;
  const d = current - prev;
  return d > 0 ? `+${d.toFixed(1)}` : d.toFixed(1);
}

export default function FitnessSummary({ latest, previous, recentWorkout }: Props) {
  const weightDelta = delta(latest?.weight_lb ?? null, previous?.weight_lb ?? null);
  const bfDelta = delta(latest?.body_fat_pct ?? null, previous?.body_fat_pct ?? null);

  return (
    <Link href="/fitness" className="block bg-neutral-900 rounded-xl p-4 border border-neutral-800 hover:border-neutral-700 transition-colors">
      <p className="text-xs text-neutral-500 uppercase tracking-wide mb-3">Fitness</p>
      {latest ? (
        <div className="space-y-1.5">
          {latest.weight_lb != null && (
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-semibold font-[family-name:var(--font-mono)] text-neutral-100">{latest.weight_lb}</span>
              <span className="text-xs text-neutral-500">lb</span>
              {weightDelta && (
                <span className={`text-xs ml-auto font-[family-name:var(--font-mono)] ${parseFloat(weightDelta) < 0 ? "text-green-400" : "text-red-400"}`}>
                  {weightDelta}
                </span>
              )}
            </div>
          )}
          {latest.body_fat_pct != null && (
            <div className="flex items-baseline gap-2">
              <span className="text-lg font-medium font-[family-name:var(--font-mono)] text-neutral-300">{latest.body_fat_pct}%</span>
              <span className="text-xs text-neutral-500">body fat</span>
              {bfDelta && (
                <span className={`text-xs ml-auto font-[family-name:var(--font-mono)] ${parseFloat(bfDelta) < 0 ? "text-green-400" : "text-red-400"}`}>
                  {bfDelta}
                </span>
              )}
            </div>
          )}
          <p className="text-xs text-neutral-600">{latest.date}</p>
        </div>
      ) : (
        <p className="text-sm text-neutral-600">No body comp data</p>
      )}

      {recentWorkout && (
        <div className="mt-3 pt-3 border-t border-neutral-800">
          <p className="text-xs text-neutral-500 mb-1">Last workout</p>
          <p className="text-sm text-neutral-300">
            {recentWorkout.activity}
            {recentWorkout.duration_mins != null && (
              <span className="text-neutral-500"> · <span className="font-[family-name:var(--font-mono)]">{recentWorkout.duration_mins}</span>m</span>
            )}
            {recentWorkout.calories != null && (
              <span className="text-neutral-500"> · <span className="font-[family-name:var(--font-mono)]">{recentWorkout.calories}</span> cal</span>
            )}
          </p>
          <p className="text-xs text-neutral-600 mt-0.5">{recentWorkout.date}</p>
        </div>
      )}
    </Link>
  );
}
