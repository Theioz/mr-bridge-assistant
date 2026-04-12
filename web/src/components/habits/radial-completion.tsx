"use client";

import { useEffect, useState } from "react";
import {
  RadialBarChart,
  RadialBar,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import type { HabitRegistry, HabitLog } from "@/lib/types";

interface Props {
  habits: HabitRegistry[];
  /** All logs from the last 7 days */
  weekLogs: HabitLog[];
}

const TOOLTIP_STYLE = {
  contentStyle: { background: "#181B24", border: "1px solid #2A2F45", borderRadius: 8 },
  labelStyle: { color: "#E2E8F0", fontSize: 13 },
  itemStyle: { color: "#64748B", fontSize: 12 },
};

function rateColor(rate: number): string {
  if (rate >= 0.8) return "#10B981";
  if (rate >= 0.5) return "#F59E0B";
  return "#EF4444";
}

export function RadialCompletion({ habits, weekLogs }: Props) {
  const [animate, setAnimate] = useState(true);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setAnimate(!mq.matches);
  }, []);

  // Count completed days per habit in the last 7 days
  const completedByHabit = new Map<string, number>();
  for (const log of weekLogs) {
    if (!log.completed) continue;
    completedByHabit.set(log.habit_id, (completedByHabit.get(log.habit_id) ?? 0) + 1);
  }

  const data = habits.map((h) => {
    const days = completedByHabit.get(h.id) ?? 0;
    const rate = days / 7;
    return {
      name: h.name,
      value: Math.round(rate * 100),
      fill: rateColor(rate),
    };
  });

  if (habits.length === 0) {
    return (
      <div
        className="rounded-xl p-5"
        style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)" }}
      >
        <p className="text-xs uppercase tracking-widest mb-3" style={{ color: "var(--color-text-muted)" }}>
          Weekly Completion
        </p>
        <p style={{ fontSize: 14, color: "var(--color-text-faint)" }}>No habits</p>
      </div>
    );
  }

  return (
    <div
      className="rounded-xl p-5"
      style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)" }}
    >
      <p className="text-xs uppercase tracking-widest mb-2" style={{ color: "var(--color-text-muted)", letterSpacing: "0.07em" }}>
        Weekly Completion
      </p>
      <ResponsiveContainer width="100%" height={220}>
        <RadialBarChart
          cx="50%"
          cy="50%"
          innerRadius={20}
          outerRadius={90}
          data={data}
          startAngle={180}
          endAngle={-180}
        >
          <RadialBar
            dataKey="value"
            background={{ fill: "var(--color-border)" }}
            isAnimationActive={animate}
            animationDuration={300}
            label={false}
          />
          <Tooltip
            {...TOOLTIP_STYLE}
            formatter={(v: number, _: string, props: { payload?: { name: string } }) => [
              `${v}%`,
              props.payload?.name ?? "",
            ]}
          />
          <Legend
            iconType="circle"
            iconSize={7}
            wrapperStyle={{ fontSize: 11, color: "#64748B" }}
            formatter={(value) => {
              const entry = data.find((d) => d.name === value);
              return `${value} ${entry ? `(${entry.value}%)` : ""}`;
            }}
          />
        </RadialBarChart>
      </ResponsiveContainer>
    </div>
  );
}
