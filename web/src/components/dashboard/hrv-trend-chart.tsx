"use client";

import { useEffect, useState } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

interface DataPoint {
  date: string;
  avg_hrv: number | null;
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

export function HrvTrendChart({ data, windowLabel = "14D" }: Props) {
  const [animate, setAnimate] = useState(true);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setAnimate(!mq.matches);
  }, []);

  const chartData = data
    .filter((d) => d.avg_hrv != null)
    .map((d) => ({
      date: d.date.slice(5),
      hrv: d.avg_hrv,
    }));

  if (chartData.length === 0) {
    return (
      <div
        className="rounded-xl p-5 h-full"
        style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)" }}
      >
        <p className="text-xs uppercase tracking-widest mb-4" style={{ color: "var(--color-text-muted)" }}>
          HRV — {windowLabel}
        </p>
        <div className="flex items-center justify-center h-40" style={{ color: "var(--color-text-faint)", fontSize: 14 }}>
          No data
        </div>
      </div>
    );
  }

  return (
    <div
      className="rounded-xl p-5 h-full"
      style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)" }}
    >
      <p className="text-xs uppercase tracking-widest mb-4" style={{ color: "var(--color-text-muted)", letterSpacing: "0.07em" }}>
        HRV — {windowLabel}
      </p>
      <ResponsiveContainer width="100%" height={180}>
        <AreaChart data={chartData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
          <defs>
            <linearGradient id="hrv-grad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#10B981" stopOpacity={0.25} />
              <stop offset="100%" stopColor="#10B981" stopOpacity={0} />
            </linearGradient>
          </defs>
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
          <Tooltip {...TOOLTIP_STYLE} formatter={(v: number) => [`${v} ms`, "HRV"]} />
          <Area
            type="monotone"
            dataKey="hrv"
            stroke="#10B981"
            strokeWidth={2}
            fill="url(#hrv-grad)"
            dot={false}
            activeDot={{ r: 4, fill: "#10B981", strokeWidth: 0 }}
            connectNulls
            isAnimationActive={animate}
            animationDuration={300}
            animationEasing="ease-out"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
