"use client";

import { useEffect, useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell,
  ResponsiveContainer,
} from "recharts";
import type { HabitRegistry } from "@/lib/types";
import type { HabitStreaks } from "@/lib/streaks";
import { useChartColors } from "@/lib/chart-colors";

interface Props {
  habits: HabitRegistry[];
  streaks: HabitStreaks;
}

export function StreakChart({ habits, streaks }: Props) {
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

  const data = habits
    .map((h) => ({
      name: h.name,
      current: streaks[h.id]?.current ?? 0,
      best: streaks[h.id]?.best ?? 0,
    }))
    .sort((a, b) => b.current - a.current);

  if (data.every((d) => d.current === 0 && d.best === 0)) {
    return (
      <div
        className="rounded-xl p-5"
        style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)" }}
      >
        <p className="text-xs uppercase tracking-widest mb-3" style={{ color: "var(--color-text-muted)" }}>
          Current Streaks
        </p>
        <p style={{ fontSize: 14, color: "var(--color-text-faint)" }}>No streak data yet</p>
      </div>
    );
  }

  const chartHeight = Math.max(120, data.length * 36);

  return (
    <div
      className="rounded-xl p-5"
      style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)" }}
    >
      <p className="text-xs uppercase tracking-widest mb-4" style={{ color: "var(--color-text-muted)", letterSpacing: "0.07em" }}>
        Current Streaks
      </p>
      <ResponsiveContainer width="100%" height={chartHeight}>
        <BarChart
          data={data}
          layout="vertical"
          margin={{ top: 0, right: 16, left: 0, bottom: 0 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke={c.grid} horizontal={false} />
          <XAxis
            type="number"
            stroke={c.axis}
            tick={{ fill: c.textMuted, fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            allowDecimals={false}
          />
          <YAxis
            type="category"
            dataKey="name"
            width={110}
            stroke={c.axis}
            tick={{ fill: c.textMuted, fontSize: 12 }}
            tickLine={false}
            axisLine={false}
          />
          <Tooltip
            {...TOOLTIP_STYLE}
            formatter={(v: number, name: string) => [
              `${v} day${v !== 1 ? "s" : ""}`,
              name === "current" ? "Current streak" : "Best streak",
            ]}
          />
          <Bar
            dataKey="current"
            name="current"
            radius={[0, 3, 3, 0]}
            isAnimationActive={animate}
            animationDuration={300}
          >
            {data.map((entry, i) => (
              <Cell
                key={i}
                fill={entry.current > 0 ? c.primary : c.grid}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
