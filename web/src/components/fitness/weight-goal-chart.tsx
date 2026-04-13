"use client";

import { useEffect, useState } from "react";
import {
  LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine,
  ResponsiveContainer,
} from "recharts";
import type { FitnessLog } from "@/lib/types";
import Link from "next/link";

interface Props {
  data: FitnessLog[];
  goal?: number | null;
  windowLabel?: string;
}

const TOOLTIP_STYLE = {
  contentStyle: { background: "#181B24", border: "1px solid #2A2F45", borderRadius: 8 },
  labelStyle: { color: "#E2E8F0", fontSize: 13 },
  itemStyle: { color: "#64748B", fontSize: 12 },
};

export function WeightGoalChart({ data, goal, windowLabel = "90D" }: Props) {
  const [animate, setAnimate] = useState(true);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setAnimate(!mq.matches);
  }, []);

  const chartData = data
    .filter((d) => d.weight_lb != null)
    .map((d) => ({ date: d.date.slice(5), weight: d.weight_lb }));

  const latest = chartData[chartData.length - 1]?.weight ?? null;
  const hasGoal = goal != null && goal > 0;

  let delta: string | null = null;
  let deltaPositive = false;
  if (hasGoal && latest != null) {
    const diff = Math.abs(latest - goal!);
    deltaPositive = latest > goal!;
    delta = deltaPositive
      ? `${diff.toFixed(1)} lb above goal`
      : diff < 0.05
      ? "At goal"
      : `${diff.toFixed(1)} lb to go`;
  }

  return (
    <div
      className="rounded-xl p-5"
      style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)" }}
    >
      <div className="flex items-start justify-between gap-3 mb-4">
        <p className="text-xs uppercase tracking-widest" style={{ color: "var(--color-text-muted)", letterSpacing: "0.07em" }}>
          Weight Progress — {windowLabel}
        </p>
        {delta && (
          <span
            className="text-xs font-medium tabular-nums"
            style={{ color: deltaPositive ? "var(--color-danger)" : "var(--color-positive)" }}
          >
            {delta}
          </span>
        )}
      </div>

      {!hasGoal && (
        <p className="text-xs mb-3" style={{ color: "var(--color-text-faint)" }}>
          <Link href="/settings" className="underline" style={{ color: "var(--color-primary)" }}>
            Set your goals in Settings
          </Link>{" "}
          to see goal tracking.
        </p>
      )}

      {chartData.length === 0 ? (
        <div className="flex items-center justify-center h-40" style={{ color: "var(--color-text-faint)", fontSize: 14 }}>
          No data for this period
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={chartData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1E2130" vertical={false} />
            <XAxis
              dataKey="date"
              stroke="#334155"
              tick={{ fill: "#64748B", fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              interval="preserveStartEnd"
            />
            <YAxis
              stroke="#334155"
              tick={{ fill: "#64748B", fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              domain={["auto", "auto"]}
            />
            <Tooltip
              {...TOOLTIP_STYLE}
              formatter={(v: number) => [`${v} lb`, "Weight"]}
            />
            {hasGoal && (
              <ReferenceLine
                y={goal}
                stroke="#64748B"
                strokeDasharray="4 3"
                strokeWidth={1.5}
                label={{ value: `Goal ${goal} lb`, fill: "#64748B", fontSize: 10, position: "insideTopRight" }}
              />
            )}
            <Line
              type="monotone"
              dataKey="weight"
              stroke="#6366F1"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, fill: "#6366F1", strokeWidth: 0 }}
              connectNulls
              isAnimationActive={animate}
              animationDuration={300}
            />
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
