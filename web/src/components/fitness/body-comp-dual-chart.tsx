"use client";

import { useEffect, useState } from "react";
import {
  ComposedChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import type { FitnessLog } from "@/lib/types";
import type { WindowKey } from "@/lib/window";
import { formatDate, computeDailyTicks } from "@/lib/chart-utils";
import { useChartColors } from "@/lib/chart-colors";

interface Props {
  data: FitnessLog[];
  windowLabel?: string;
  windowKey: WindowKey;
}

export function BodyCompDualChart({ data, windowLabel = "90D", windowKey }: Props) {
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

  const chartData = data.map((d) => ({
    date: formatDate(d.date),
    weight: d.weight_lb,
    bodyFat: d.body_fat_pct,
  }));
  const ticks = computeDailyTicks(data.map((d) => d.date), windowKey);

  if (chartData.length === 0) {
    return (
      <div
        className="rounded-xl p-5 transition-all duration-200 card-lift"
        style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)" }}
      >
        <p className="text-xs uppercase tracking-widest mb-4" style={{ color: "var(--color-text-muted)" }}>
          Body Composition — {windowLabel}
        </p>
        <div className="flex items-center justify-center h-48" style={{ color: "var(--color-text-faint)", fontSize: 14 }}>
          No data for this period
        </div>
      </div>
    );
  }

  return (
    <div
      className="rounded-xl p-5 transition-all duration-200 card-lift"
      style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)" }}
    >
      <p className="text-xs uppercase tracking-widest mb-4" style={{ color: "var(--color-text-muted)", letterSpacing: "0.07em" }}>
        Body Composition — {windowLabel}
      </p>
      <ResponsiveContainer width="100%" height={240}>
        <ComposedChart data={chartData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={c.grid} vertical={false} />
          <XAxis
            dataKey="date"
            stroke={c.axis}
            tick={{ fill: c.textMuted, fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            ticks={ticks}
          />
          <YAxis
            yAxisId="weight"
            orientation="left"
            stroke={c.axis}
            tick={{ fill: c.textMuted, fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            domain={["auto", "auto"]}
          />
          <YAxis
            yAxisId="bf"
            orientation="right"
            stroke={c.axis}
            tick={{ fill: c.textMuted, fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            domain={["auto", "auto"]}
            tickFormatter={(v) => `${v}%`}
          />
          <Tooltip
            {...TOOLTIP_STYLE}
            formatter={(v: number, name: string) =>
              name === "Body Fat %" ? [`${v}%`, name] : [`${v} lb`, name]
            }
          />
          <Legend
            iconType="circle"
            iconSize={7}
            wrapperStyle={{ fontSize: 12, color: c.textMuted, paddingTop: 8 }}
          />
          <Line
            yAxisId="weight"
            type="monotone"
            dataKey="weight"
            name="Weight (lb)"
            stroke={c.primary}
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4, fill: c.primary, strokeWidth: 0 }}
            connectNulls
            isAnimationActive={animate}
            animationDuration={300}
          />
          <Line
            yAxisId="bf"
            type="monotone"
            dataKey="bodyFat"
            name="Body Fat %"
            stroke={c.positive}
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4, fill: c.positive, strokeWidth: 0 }}
            connectNulls
            isAnimationActive={animate}
            animationDuration={300}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
