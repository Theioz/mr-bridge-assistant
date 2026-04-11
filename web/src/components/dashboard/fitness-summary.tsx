import Link from "next/link";
import { TrendingDown, TrendingUp, Minus } from "lucide-react";
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

function TrendIcon({ value, invert = false }: { value: string | null; invert?: boolean }) {
  if (!value) return null;
  const n = parseFloat(value);
  const isGood = invert ? n < 0 : n > 0;
  const isFlat = Math.abs(n) < 0.05;
  if (isFlat) return <Minus size={12} className="text-neutral-500" />;
  if (isGood) return <TrendingDown size={12} className="text-green-400" />;
  return <TrendingUp size={12} className="text-red-400" />;
}

export default function FitnessSummary({ latest, previous, recentWorkout }: Props) {
  const weightDelta = delta(latest?.weight_lb ?? null, previous?.weight_lb ?? null);
  const bfDelta = delta(latest?.body_fat_pct ?? null, previous?.body_fat_pct ?? null);

  return (
    <Link href="/fitness" className="block bg-neutral-900 rounded-xl p-4 border border-neutral-800 hover:border-neutral-700 transition-colors h-full">
      <p className="text-xs text-neutral-500 uppercase tracking-wide mb-3">Fitness</p>

      {latest ? (
        <div className="space-y-2">
          {/* Weight row */}
          {latest.weight_lb != null && (
            <div className="flex items-center gap-2">
              <span className="text-2xl font-semibold font-[family-name:var(--font-mono)] text-neutral-100 leading-none">
                {latest.weight_lb}
              </span>
              <span className="text-xs text-neutral-500">lb</span>
              {weightDelta && (
                <span className={`flex items-center gap-0.5 text-xs ml-auto font-[family-name:var(--font-mono)] ${parseFloat(weightDelta) < 0 ? "text-green-400" : "text-red-400"}`}>
                  <TrendIcon value={weightDelta} invert />
                  {weightDelta}
                </span>
              )}
            </div>
          )}

          {/* Body fat row */}
          {latest.body_fat_pct != null && (
            <div className="flex items-center gap-2">
              <span className="text-lg font-medium font-[family-name:var(--font-mono)] text-neutral-300 leading-none">
                {latest.body_fat_pct}%
              </span>
              <span className="text-xs text-neutral-500">body fat</span>
              {bfDelta && (
                <span className={`flex items-center gap-0.5 text-xs ml-auto font-[family-name:var(--font-mono)] ${parseFloat(bfDelta) < 0 ? "text-green-400" : "text-red-400"}`}>
                  <TrendIcon value={bfDelta} invert />
                  {bfDelta}
                </span>
              )}
            </div>
          )}

          {/* Muscle mass row if available */}
          {latest.muscle_mass_lb != null && (
            <div className="flex items-center gap-2">
              <span className="text-sm font-[family-name:var(--font-mono)] text-neutral-400 leading-none">
                {latest.muscle_mass_lb}
              </span>
              <span className="text-xs text-neutral-500">lb muscle</span>
            </div>
          )}

          <p className="text-xs text-neutral-600 pt-0.5">{latest.date}</p>
        </div>
      ) : (
        <p className="text-sm text-neutral-600">No body comp data</p>
      )}

      {recentWorkout && (
        <div className="mt-3 pt-3 border-t border-neutral-800">
          <p className="text-xs text-neutral-500 mb-1.5">Last workout</p>
          <p className="text-sm text-neutral-300 font-medium">{recentWorkout.activity}</p>
          <p className="text-xs text-neutral-500 mt-0.5 font-[family-name:var(--font-mono)]">
            {recentWorkout.duration_mins != null && <span>{recentWorkout.duration_mins}m</span>}
            {recentWorkout.calories != null && (
              <span>{recentWorkout.duration_mins != null ? " · " : ""}{recentWorkout.calories} cal</span>
            )}
            {recentWorkout.avg_hr != null && (
              <span> · {recentWorkout.avg_hr} bpm</span>
            )}
          </p>
          <p className="text-xs text-neutral-600 mt-0.5">{recentWorkout.date}</p>
        </div>
      )}
    </Link>
  );
}
