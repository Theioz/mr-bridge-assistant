"use client";

import Link from "next/link";
import { Dumbbell } from "lucide-react";

interface Workout {
  date: string;
  activity: string | null;
  duration_mins: number | null;
  calories: number | null;
}

interface Props {
  workouts: Workout[];
}

function fmtDate(d: string) {
  return new Date(d + "T00:00:00").toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

export function RecentWorkoutsTable({ workouts }: Props) {
  return (
    <div
      className="rounded-xl p-5"
      style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)" }}
    >
      <div className="flex items-center justify-between mb-4">
        <p className="text-xs uppercase tracking-widest" style={{ color: "var(--color-text-muted)", letterSpacing: "0.07em" }}>
          Recent Workouts
        </p>
        <Link
          href="/fitness"
          className="text-xs transition-colors duration-150 cursor-pointer"
          style={{ color: "var(--color-text-muted)" }}
          onMouseEnter={(e) => ((e.target as HTMLElement).style.color = "var(--color-text)")}
          onMouseLeave={(e) => ((e.target as HTMLElement).style.color = "var(--color-text-muted)")}
        >
          View all →
        </Link>
      </div>

      {workouts.length === 0 ? (
        <div className="flex items-center gap-2 py-6" style={{ color: "var(--color-text-faint)", fontSize: 14 }}>
          <Dumbbell size={16} />
          <span>No workouts logged</span>
        </div>
      ) : (
        <table className="w-full" style={{ fontSize: 13, borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ color: "var(--color-text-muted)", fontSize: 11 }}>
              <th className="text-left pb-2 font-medium" style={{ letterSpacing: "0.05em" }}>Date</th>
              <th className="text-left pb-2 font-medium" style={{ letterSpacing: "0.05em" }}>Activity</th>
              <th className="text-right pb-2 font-medium" style={{ letterSpacing: "0.05em" }}>Duration</th>
              <th className="text-right pb-2 font-medium" style={{ letterSpacing: "0.05em" }}>Calories</th>
            </tr>
          </thead>
          <tbody>
            {workouts.map((w, i) => (
              <tr
                key={i}
                style={{
                  borderTop: "1px solid var(--color-border)",
                  color: "var(--color-text)",
                }}
              >
                <td className="py-2.5" style={{ color: "var(--color-text-muted)" }}>{fmtDate(w.date)}</td>
                <td className="py-2.5 capitalize font-medium">{w.activity ?? "—"}</td>
                <td className="py-2.5 text-right tabular-nums" style={{ color: "var(--color-text-muted)" }}>
                  {w.duration_mins != null ? `${w.duration_mins}m` : "—"}
                </td>
                <td className="py-2.5 text-right tabular-nums" style={{ color: "var(--color-text-muted)" }}>
                  {w.calories != null ? `${w.calories}` : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
