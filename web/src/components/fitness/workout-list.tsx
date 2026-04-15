import type { WorkoutSession } from "@/lib/types";

interface Props {
  workouts: WorkoutSession[];
}

export default function WorkoutList({ workouts }: Props) {
  if (workouts.length === 0) {
    return <p className="text-sm" style={{ color: "var(--color-text-faint)" }}>No workouts logged.</p>;
  }

  return (
    <div className="space-y-2">
      {workouts.map((w) => (
        <div
          key={w.id}
          className="flex items-center gap-3 rounded-xl px-4 py-3"
          style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)" }}
        >
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium capitalize" style={{ color: "var(--color-text)" }}>{w.activity}</p>
            <p className="text-xs mt-0.5" style={{ color: "var(--color-text-muted)" }}>{w.date}</p>
          </div>
          <div className="flex gap-3 text-xs flex-shrink-0" style={{ color: "var(--color-text-muted)" }}>
            {w.duration_mins != null && <span>{w.duration_mins} min</span>}
            {w.calories != null && <span>{w.calories} cal</span>}
            {w.avg_hr != null && <span>{w.avg_hr} bpm</span>}
          </div>
        </div>
      ))}
    </div>
  );
}
