"use client";

import { useEffect, useState } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import type { WorkoutSession } from "@/lib/types";

interface Props {
  sessions: WorkoutSession[];
  weekCount?: number;
}

const TOOLTIP_STYLE = {
  contentStyle: { background: "#181B24", border: "1px solid #2A2F45", borderRadius: 8 },
  labelStyle: { color: "#E2E8F0", fontSize: 13 },
  itemStyle: { color: "#64748B", fontSize: 12 },
};

function getISOWeekLabel(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  // Find Monday of that week
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

export function WorkoutFreqChart({ sessions, weekCount = 8 }: Props) {
  const [animate, setAnimate] = useState(true);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setAnimate(!mq.matches);
  }, []);

  // Build week slots from oldest to newest
  const now = new Date();
  const weeks: { key: string; label: string; count: number }[] = [];
  for (let i = weekCount - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i * 7);
    const dateStr = d.toISOString().slice(0, 10);
    const key = getISOWeekKey(dateStr);
    if (!weeks.find((w) => w.key === key)) {
      weeks.push({ key, label: getISOWeekLabel(dateStr), count: 0 });
    }
  }

  sessions.forEach((s) => {
    const key = getISOWeekKey(s.date);
    const slot = weeks.find((w) => w.key === key);
    if (slot) slot.count++;
  });

  return (
    <div
      className="rounded-xl p-5"
      style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)" }}
    >
      <p className="text-xs uppercase tracking-widest mb-4" style={{ color: "var(--color-text-muted)", letterSpacing: "0.07em" }}>
        Workout Frequency — {weekCount} Weeks
      </p>
      <ResponsiveContainer width="100%" height={200}>
        <BarChart data={weeks} margin={{ top: 4, right: 4, left: -24, bottom: 0 }}>
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
            allowDecimals={false}
          />
          <Tooltip {...TOOLTIP_STYLE} formatter={(v: number) => [v, "Sessions"]} />
          <Bar
            dataKey="count"
            name="Sessions"
            fill="#6366F1"
            radius={[3, 3, 0, 0]}
            isAnimationActive={animate}
            animationDuration={300}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
