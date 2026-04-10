import type { WorkoutSession } from "@/lib/types";

interface Props {
  workouts: WorkoutSession[];
}

export default function WorkoutList({ workouts }: Props) {
  if (workouts.length === 0) {
    return <p className="text-sm text-neutral-600">No workouts logged.</p>;
  }

  return (
    <div className="space-y-2">
      {workouts.map((w) => (
        <div
          key={w.id}
          className="flex items-center gap-3 bg-neutral-900 rounded-xl px-4 py-3 border border-neutral-800"
        >
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-neutral-200 capitalize">{w.activity}</p>
            <p className="text-xs text-neutral-500 mt-0.5">{w.date}</p>
          </div>
          <div className="flex gap-3 text-xs text-neutral-500 flex-shrink-0">
            {w.duration_mins != null && <span>{w.duration_mins} min</span>}
            {w.calories != null && <span>{w.calories} cal</span>}
            {w.avg_hr != null && <span>{w.avg_hr} bpm</span>}
          </div>
        </div>
      ))}
    </div>
  );
}
