"use client";

import { useEffect, useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { useChartColors } from "@/lib/chart-colors";

interface DataPoint {
  date: string;
  weight_lb: number | null;
}

interface Props {
  data: DataPoint[];
  windowLabel?: string;
  weightLb?: number | null;
  bfPct?: number | null;
  weightDelta?: number | null;
  bfDelta?: number | null;
}

function DeltaBadge({ delta, positiveIsDown }: { delta: number; positiveIsDown?: boolean }) {
  const isGood = positiveIsDown ? delta < 0 : delta > 0;
  const color = delta === 0 ? "var(--color-text-faint)" : isGood ? "var(--color-positive)" : "var(--color-danger)";
  const sign = delta > 0 ? "+" : "";
  return (
    <span className="text-xs tabular-nums" style={{ color }}>
      {sign}{delta.toFixed(1)}
    </span>
  );
}

export function WeightTrendChart({ data, windowLabel = "30D", weightLb, bfPct, weightDelta, bfDelta }: Props) {
  const c = useChartColors();
  const tooltipStyle = {
    contentStyle: { background: c.tooltipBg, border: `1px solid ${c.tooltipBorder}`, borderRadius: 8 },
    labelStyle: { color: c.text, fontSize: 13 },
    itemStyle: { color: c.textMuted, fontSize: 12 },
  };
  const [animate, setAnimate] = useState(true);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setAnimate(!mq.matches);
  }, []);

  const chartData = data.map((d) => ({
    date: d.date.slice(5),
    weight: d.weight_lb,
  }));

  if (chartData.length === 0) {
    return (
      <div
        className="rounded-xl p-5 h-full"
        style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)" }}
      >
        <p className="text-xs uppercase tracking-widest mb-4" style={{ color: "var(--color-text-muted)", letterSpacing: "0.07em" }}>
          Weight — {windowLabel}
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
      <div className="flex items-start justify-between mb-4">
        <p className="text-xs uppercase tracking-widest" style={{ color: "var(--color-text-muted)", letterSpacing: "0.07em" }}>
          Weight — {windowLabel}
        </p>
        <div className="flex items-center gap-5">
          {weightLb != null && (
            <div className="text-right">
              <span className="font-heading font-semibold tabular-nums" style={{ fontSize: 18, color: "var(--color-text)" }}>
                {weightLb.toFixed(1)}
                <span className="text-xs ml-0.5 font-normal" style={{ color: "var(--color-text-muted)" }}>lb</span>
              </span>
              {weightDelta != null && (
                <div><DeltaBadge delta={weightDelta} positiveIsDown /></div>
              )}
            </div>
          )}
          {bfPct != null && (
            <div className="text-right">
              <span className="font-heading font-semibold tabular-nums" style={{ fontSize: 18, color: "var(--color-text)" }}>
                {bfPct.toFixed(1)}
                <span className="text-xs ml-0.5 font-normal" style={{ color: "var(--color-text-muted)" }}>%</span>
              </span>
              {bfDelta != null && (
                <div><DeltaBadge delta={bfDelta} positiveIsDown /></div>
              )}
            </div>
          )}
        </div>
      </div>
      <ResponsiveContainer width="100%" height={180}>
        <LineChart data={chartData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
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
            domain={["auto", "auto"]}
          />
          <Tooltip {...tooltipStyle} formatter={(v: number) => [`${v} lb`, "Weight"]} />
          <Line
            type="monotone"
            dataKey="weight"
            stroke={c.primary}
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4, fill: c.primary, strokeWidth: 0 }}
            connectNulls
            isAnimationActive={animate}
            animationDuration={300}
            animationEasing="ease-out"
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
