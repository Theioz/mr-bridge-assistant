"use client";

import { LineChart, Line, ResponsiveContainer } from "recharts";
import type { WeightUnit } from "@/lib/units";
import { kgToDisplay } from "@/lib/units";

interface Props {
  exerciseName: string;
  points: { performed_on: string; top_weight_kg: number | null; top_reps: number | null }[];
  unit: WeightUnit;
}

export function ExerciseSparkline({ exerciseName, points, unit }: Props) {
  const data = points
    .slice()
    .sort((a, b) => a.performed_on.localeCompare(b.performed_on))
    .map((p) => ({ close: kgToDisplay(p.top_weight_kg, unit) ?? 0 }))
    .filter((p) => p.close > 0);

  const latest = data[data.length - 1]?.close ?? null;
  const first = data[0]?.close ?? null;
  const delta = latest != null && first != null ? latest - first : null;

  return (
    <div
      className="rounded-lg px-3.5 py-3"
      style={{
        background: "var(--color-surface-raised)",
        border: "1px solid var(--color-border)",
      }}
    >
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <p
            style={{
              fontSize: 12,
              fontWeight: 500,
              color: "var(--color-text)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
            title={exerciseName}
          >
            {exerciseName}
          </p>
          <p
            className="tabular-nums"
            style={{ fontSize: 11, color: "var(--color-text-muted)", marginTop: 2 }}
          >
            {latest != null ? `${latest} ${unit}` : "—"}
            {delta != null && delta !== 0 && (
              <span
                style={{
                  marginLeft: 6,
                  color: delta > 0 ? "var(--color-positive)" : "var(--color-danger)",
                }}
              >
                {delta > 0 ? "+" : ""}
                {Math.round(delta * 10) / 10}
              </span>
            )}
          </p>
        </div>
        <div style={{ width: 80, height: 32, flexShrink: 0 }}>
          {data.length > 1 ? (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data} margin={{ top: 2, right: 2, left: 2, bottom: 2 }}>
                <Line
                  type="monotone"
                  dataKey="close"
                  stroke="var(--color-primary)"
                  strokeWidth={1.5}
                  dot={false}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div
              style={{
                width: "100%",
                height: "100%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 10,
                color: "var(--color-text-faint)",
              }}
            >
              —
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
