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
import { useChartColors } from "@/lib/chart-colors";

interface DataPoint {
  date: string;
  active_cal: number | null;
}

interface Props {
  data: DataPoint[];
  windowLabel?: string;
}

export function ActiveCalChart({ data, windowLabel = "30D" }: Props) {
  const [animate, setAnimate] = useState(true);
  const c = useChartColors();

  const tooltipStyle = {
    contentStyle: { background: c.tooltipBg, border: `1px solid ${c.tooltipBorder}`, borderRadius: 8 },
    labelStyle: { color: c.text, fontSize: 13 },
    itemStyle: { color: c.textMuted, fontSize: 12 },
  };

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setAnimate(!mq.matches);
  }, []);

  const chartData = data
    .filter((d) => d.active_cal != null)
    .map((d) => ({
      date: d.date.slice(5),
      cal: d.active_cal,
    }));

  return (
    <div
      className="rounded-xl p-5"
      style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)" }}
    >
      <p className="text-xs uppercase tracking-widest mb-4" style={{ color: "var(--color-text-muted)", letterSpacing: "0.07em" }}>
        Active Calories — {windowLabel}
      </p>
      {chartData.length === 0 ? (
        <div className="flex items-center justify-center h-40" style={{ color: "var(--color-text-faint)", fontSize: 14 }}>
          No data
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={200}>
          <AreaChart data={chartData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
            <defs>
              <linearGradient id="cal-grad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={c.warning} stopOpacity={0.3} />
                <stop offset="100%" stopColor={c.warning} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke={c.grid} vertical={false} />
            <XAxis
              dataKey="date"
              stroke={c.axis}
              tick={{ fill: c.textMuted, fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              interval="preserveStartEnd"
            />
            <YAxis
              stroke={c.axis}
              tick={{ fill: c.textMuted, fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              domain={[0, "auto"]}
            />
            <Tooltip {...tooltipStyle} formatter={(v: number) => [`${v} kcal`, "Active Cal"]} />
            <Area
              type="monotone"
              dataKey="cal"
              stroke={c.warning}
              strokeWidth={2}
              fill="url(#cal-grad)"
              dot={false}
              activeDot={{ r: 4, fill: c.warning, strokeWidth: 0 }}
              connectNulls
              isAnimationActive={animate}
              animationDuration={300}
            />
          </AreaChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
