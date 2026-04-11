import Link from "next/link";
import type { HabitLog, HabitRegistry } from "@/lib/types";

interface Props {
  habits: HabitLog[];
  total: number;
  registry: Pick<HabitRegistry, "id" | "name" | "emoji">[];
}

export default function HabitsSummary({ habits, total, registry }: Props) {
  const completed = habits.filter((h) => h.completed).length;
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;

  const habitItems = registry.map((reg) => ({
    id: reg.id,
    name: reg.name,
    emoji: reg.emoji,
    completed: habits.some((h) => h.habit_id === reg.id && h.completed),
  }));

  return (
    <Link href="/habits" className="block bg-neutral-900 rounded-xl p-4 border border-neutral-800 hover:border-neutral-700 transition-colors">
      <p className="text-xs text-neutral-500 uppercase tracking-wide mb-3">Habits today</p>

      {/* Count + progress bar */}
      <p className="text-2xl font-semibold font-[family-name:var(--font-mono)] text-neutral-100">
        {completed}
        <span className="text-neutral-500 text-lg font-normal"> / {total}</span>
      </p>
      <div className="mt-2 h-1 bg-neutral-800 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${pct === 100 ? "bg-green-500" : "bg-blue-500"}`}
          style={{ width: `${pct}%` }}
        />
      </div>

      {/* Individual habit pills */}
      {habitItems.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-3">
          {habitItems.map((h) => (
            <span
              key={h.id}
              className={`text-xs px-2 py-0.5 rounded-full border transition-colors ${
                h.completed
                  ? "bg-green-950/50 border-green-800/60 text-green-400"
                  : "bg-neutral-800/50 border-neutral-700/60 text-neutral-500"
              }`}
            >
              {h.emoji ? `${h.emoji} ${h.name}` : h.name}
            </span>
          ))}
        </div>
      )}
    </Link>
  );
}
