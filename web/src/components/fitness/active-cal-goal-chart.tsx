"use client";

import { useEffect, useState } from "react";
import {
  AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine,
  ResponsiveContainer,
} from "recharts";
import Link from "next/link";

interface DataPoint {
  date: string;
  active_cal: number | null;
}

interface Props {
  data: DataPoint[];
  goal?: number | null;
  weekCount?: number;
}

const TOOLTIP_STYLE = {
  contentStyle: { background: "#181B24", border: "1px solid #2A2F45", borderRadius: 8 },
  labelStyle: { color: "#E2E8F0", fontSize: 13 },
  itemStyle: { color: "#64748B", fontSize: 12 },
};

function getISOWeekLabel(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  const day = d.getDay();
  const diff = (day === 0 ? -6 : 1) - day;
  const monday = new Date(d);
  monday.setDate(d.getDate() + diff);
  return monday.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function getISOWeekKey(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  const day = d.getDay();
  const diff = (day === 0 ? -6 : 1) - day;
  const monday = new Date(d);
  monday.setDate(d.getDate() + diff);
  return monday.toISOString().slice(0, 10);
}

export function ActiveCalGoalChart({ data, goal, weekCount = 8 }: Props) {
  const [animate, setAnimate] = useState(true);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setAnimate(!mq.matches);
  }, []);

  // Build 8-week slots
  const now = new Date();
  const weeks: { key: string; label: string; total: number }[] = [];
  for (let i = weekCount - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i * 7);
    const dateStr = d.toISOString().slice(0, 10);
    const key = getISOWeekKey(dateStr);
    if (!weeks.find((w) => w.key === key)) {
      weeks.push({ key, label: getISOWeekLabel(dateStr), total: 0 });
    }
  }

  data.forEach((d) => {
    if (d.active_cal == null) return;
    const key = getISOWeekKey(d.date);
    const slot = weeks.find((w) => w.key === key);
    if (slot) slot.total += d.active_cal;
  });

  const hasGoal = goal != null && goal > 0;

  return (
    <div
      className="rounded-xl p-5"
      style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)" }}
    >
      <div className="flex items-center justify-between mb-4">
        <p className="text-xs uppercase tracking-widest" style={{ color: "var(--color-text-muted)", letterSpacing: "0.07em" }}>
          Active Calories — {weekCount} Weeks
        </p>
        {hasGoal && (
          <span className="text-xs tabular-nums" style={{ color: "var(--color-text-faint)" }}>
            Goal: {goal!.toLocaleString()} kcal/wk
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

      <ResponsiveContainer width="100%" height={200}>
        <AreaChart data={weeks} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
          <defs>
            <linearGradient id="acal-goal-grad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%"   stopColor="#F59E0B" stopOpacity={0.3} />
              <stop offset="100%" stopColor="#F59E0B" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#1E2130" vertical={false} />
          <XAxis
            dataKey="label"
            stroke="#334155"
            tick={{ fill: "#64748B", fontSize: 10 }}
            tickLine={false}
            axisLine={false}
            interval={0}
          />
          <YAxis
            stroke="#334155"
            tick={{ fill: "#64748B", fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            domain={[0, "auto"]}
          />
          <Tooltip
            {...TOOLTIP_STYLE}
            formatter={(v: number) => [`${Math.round(v).toLocaleString()} kcal`, "Active Cal"]}
          />
          {hasGoal && (
            <ReferenceLine
              y={goal}
              stroke="#64748B"
              strokeDasharray="4 3"
              strokeWidth={1.5}
            />
          )}
          <Area
            type="monotone"
            dataKey="total"
            stroke="#F59E0B"
            strokeWidth={2}
            fill="url(#acal-goal-grad)"
            dot={false}
            activeDot={{ r: 4, fill: "#F59E0B", strokeWidth: 0 }}
            isAnimationActive={animate}
            animationDuration={300}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
