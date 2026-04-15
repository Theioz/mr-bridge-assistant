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
import { useChartColors, type ChartColors } from "@/lib/chart-colors";

interface Props {
  habits: HabitRegistry[];
  weekLogs: HabitLog[];
}

function rateColor(rate: number, c: ChartColors): string {
  if (rate >= 0.8) return c.positive;
  if (rate >= 0.5) return c.warning;
  return c.danger;
}

export function RadialCompletion({ habits, weekLogs }: Props) {
  const [animate, setAnimate] = useState(true);
  const c = useChartColors();
  const TOOLTIP_STYLE = {
    contentStyle: { background: c.tooltipBg, border: `1px solid ${c.tooltipBorder}`, borderRadius: 8 },
    labelStyle: { color: c.text, fontSize: 13 },
    itemStyle: { color: c.textMuted, fontSize: 12 },
  };

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
      fill: rateColor(rate, c),
    };
  });

  if (habits.length === 0) {
    return (
      <div
        className="rounded-xl p-5 transition-all duration-200 card-lift"
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
      className="rounded-xl p-5 transition-all duration-200 card-lift"
      style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)" }}
    >
      <p className="text-xs uppercase tracking-widest mb-2" style={{ color: "var(--color-text-muted)", letterSpacing: "0.07em" }}>
        Weekly Completion
      </p>
      <ResponsiveContainer width="100%" height={260}>
        <RadialBarChart
          cx="50%"
          cy="50%"
          innerRadius={20}
          outerRadius={80}
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
            wrapperStyle={{ fontSize: 11, color: c.textMuted }}
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
