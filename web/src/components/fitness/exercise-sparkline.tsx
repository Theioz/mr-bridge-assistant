"use client";

import type { WeightUnit } from "@/lib/units";
import { kgToDisplay } from "@/lib/units";
import { Sparkline } from "@/components/charts/sparkline";

interface Props {
  exerciseName: string;
  points: {
    performed_on: string;
    top_weight_kg: number | null;
    top_reps: number | null;
  }[];
  unit: WeightUnit;
}

export function ExerciseSparkline({ exerciseName, points, unit }: Props) {
  const series = points
    .slice()
    .sort((a, b) => a.performed_on.localeCompare(b.performed_on))
    .map((p) => kgToDisplay(p.top_weight_kg, unit))
    .filter((v): v is number => v != null && v > 0);

  const latest = series[series.length - 1] ?? null;
  const first = series[0] ?? null;
  const delta = latest != null && first != null ? latest - first : null;

  return (
    <div
      className="flex flex-col"
      style={{
        minWidth: 0,
        paddingTop: "var(--space-2)",
        borderTop: "1px solid var(--rule-soft)",
        gap: "var(--space-2)",
      }}
    >
      <div
        className="flex items-baseline justify-between gap-2 min-w-0"
        style={{ flexWrap: "wrap" }}
      >
        <span
          style={{
            fontSize: "var(--t-micro)",
            fontWeight: 500,
            color: "var(--color-text)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            minWidth: 0,
          }}
          title={exerciseName}
        >
          {exerciseName}
        </span>
        <span className="tnum" style={{ fontSize: 11, color: "var(--color-text-muted)" }}>
          {latest != null ? `${latest} ${unit}` : "—"}
          {delta != null && delta !== 0 && (
            <span
              style={{
                marginLeft: 6,
                color: delta > 0 ? "var(--color-positive)" : "var(--color-danger)",
              }}
            >
              {delta > 0 ? "+" : ""}
              {(Math.round(delta * 10) / 10).toFixed(1)}
            </span>
          )}
        </span>
      </div>
      {series.length > 1 ? (
        <Sparkline values={series} ariaLabel={`${exerciseName} top-weight trend`} />
      ) : (
        <span
          style={{
            fontSize: 11,
            color: "var(--color-text-faint)",
            fontStyle: "italic",
          }}
        >
          Only one session logged
        </span>
      )}
    </div>
  );
}
