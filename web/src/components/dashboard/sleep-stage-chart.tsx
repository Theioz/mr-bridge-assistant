"use client";

import { useEffect, useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

interface DataPoint {
  date: string;
  deep_hrs: number | null;
  rem_hrs: number | null;
  light_hrs: number | null;
}

interface Props {
  data: DataPoint[];
  windowLabel?: string;
}

const TOOLTIP_STYLE = {
  contentStyle: { background: "#181B24", border: "1px solid #2A2F45", borderRadius: 8 },
  labelStyle: { color: "#E2E8F0", fontSize: 13 },
  itemStyle: { color: "#64748B", fontSize: 12 },
};

function fmtHrs(v: number) {
  const h = Math.floor(v);
  const m = Math.round((v - h) * 60);
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

export function SleepStageChart({ data, windowLabel = "7D" }: Props) {
  const [animate, setAnimate] = useState(true);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setAnimate(!mq.matches);
  }, []);

  const chartData = data.map((d) => ({
    date: d.date.slice(5),
    deep: d.deep_hrs ?? 0,
    rem: d.rem_hrs ?? 0,
    light: d.light_hrs ?? 0,
  }));

  return (
    <div
      className="rounded-xl p-5"
      style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)" }}
    >
      <p className="text-xs uppercase tracking-widest mb-4" style={{ color: "var(--color-text-muted)", letterSpacing: "0.07em" }}>
        Sleep Stages — {windowLabel}
      </p>

      {chartData.length === 0 ? (
        <div className="flex items-center justify-center h-40" style={{ color: "var(--color-text-faint)", fontSize: 14 }}>
          No data
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={chartData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1E2130" vertical={false} />
            <XAxis
              dataKey="date"
              stroke="#334155"
              tick={{ fill: "#64748B", fontSize: 11 }}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              stroke="#334155"
              tick={{ fill: "#64748B", fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              tickFormatter={fmtHrs}
            />
            <Tooltip
              {...TOOLTIP_STYLE}
              formatter={(v: number, name: string) => [fmtHrs(v), name.charAt(0).toUpperCase() + name.slice(1)]}
            />
            <Legend
              iconType="circle"
              iconSize={7}
              wrapperStyle={{ fontSize: 12, color: "#64748B", paddingTop: 8 }}
            />
            <Bar dataKey="deep"  name="Deep"  fill="#6366F1" stackId="sleep" isAnimationActive={animate} animationDuration={300} radius={[0,0,0,0]} />
            <Bar dataKey="rem"   name="REM"   fill="#A78BFA" stackId="sleep" isAnimationActive={animate} animationDuration={300} />
            <Bar dataKey="light" name="Light" fill="#38BDF8" stackId="sleep" isAnimationActive={animate} animationDuration={300} radius={[3,3,0,0]} />
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
