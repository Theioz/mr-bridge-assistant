import Link from "next/link";
import type { FitnessLog } from "@/lib/types";

interface Props {
  latest: FitnessLog | null;
  previous: FitnessLog | null;
}

function delta(current: number | null, prev: number | null) {
  if (current == null || prev == null) return null;
  const d = current - prev;
  return d > 0 ? `+${d.toFixed(1)}` : d.toFixed(1);
}

export default function FitnessSummary({ latest, previous }: Props) {
  const weightDelta = delta(latest?.weight_lb ?? null, previous?.weight_lb ?? null);
  const bfDelta = delta(latest?.body_fat_pct ?? null, previous?.body_fat_pct ?? null);

  return (
    <Link href="/fitness" className="block bg-neutral-900 rounded-xl p-4 border border-neutral-800 hover:border-neutral-700 transition-colors">
      <p className="text-xs text-neutral-500 uppercase tracking-wide mb-3">Body comp</p>
      {latest ? (
        <div className="space-y-1.5">
          {latest.weight_lb != null && (
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-semibold text-neutral-100">{latest.weight_lb}</span>
              <span className="text-xs text-neutral-500">lb</span>
              {weightDelta && (
                <span className={`text-xs ml-auto ${parseFloat(weightDelta) < 0 ? "text-green-400" : "text-red-400"}`}>
                  {weightDelta}
                </span>
              )}
            </div>
          )}
          {latest.body_fat_pct != null && (
            <div className="flex items-baseline gap-2">
              <span className="text-lg font-medium text-neutral-300">{latest.body_fat_pct}%</span>
              <span className="text-xs text-neutral-500">body fat</span>
              {bfDelta && (
                <span className={`text-xs ml-auto ${parseFloat(bfDelta) < 0 ? "text-green-400" : "text-red-400"}`}>
                  {bfDelta}
                </span>
              )}
            </div>
          )}
          <p className="text-xs text-neutral-600 mt-2">{latest.date}</p>
        </div>
      ) : (
        <p className="text-sm text-neutral-600">No data yet</p>
      )}
    </Link>
  );
}
