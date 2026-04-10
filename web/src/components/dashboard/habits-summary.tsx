import Link from "next/link";
import type { HabitLog } from "@/lib/types";

interface Props {
  habits: HabitLog[];
  total: number;
}

export default function HabitsSummary({ habits, total }: Props) {
  const completed = habits.filter((h) => h.completed).length;
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;

  return (
    <Link href="/habits" className="block bg-neutral-900 rounded-xl p-4 border border-neutral-800 hover:border-neutral-700 transition-colors">
      <p className="text-xs text-neutral-500 uppercase tracking-wide mb-3">Habits today</p>
      <p className="text-2xl font-semibold font-[family-name:var(--font-mono)] text-neutral-100">
        {completed}
        <span className="text-neutral-500 text-lg font-normal"> / {total}</span>
      </p>
      <div className="mt-3 h-1.5 bg-neutral-800 rounded-full overflow-hidden">
        <div
          className="h-full bg-blue-500 rounded-full transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="mt-1.5 text-xs text-neutral-500">{pct}% complete</p>
    </Link>
  );
}
