"use client";

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
import { useChartColors } from "@/lib/chart-colors";

interface Props {
  data: FitnessLog[];
}

interface TooltipProps {
  active?: boolean;
  payload?: { name: string; value: number; color: string }[];
  label?: string;
}

function CustomTooltip({ active, payload, label }: TooltipProps) {
  if (!active || !payload?.length) return null;
  return (
    <div
      className="rounded-lg px-3 py-2 text-xs"
      style={{
        background: "var(--color-surface-raised)",
        border: "1px solid var(--color-border)",
      }}
    >
      <p style={{ color: "var(--color-text-muted)", marginBottom: 4 }}>{label}</p>
      {payload.map((p) => (
        <p key={p.name} style={{ color: p.color }}>
          {p.name}: {p.value}
        </p>
      ))}
    </div>
  );
}

export default function BodyCompChart({ data }: Props) {
  const c = useChartColors();
  const chartData = data.map((d) => ({
    date: d.date.slice(5),
    weight: d.weight_lb,
    bodyFat: d.body_fat_pct,
  }));

  if (chartData.length === 0) {
    return (
      <div className="h-48 flex items-center justify-center text-sm" style={{ color: "var(--color-text-faint)" }}>
        No fitness data yet
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={200}>
      <ComposedChart data={chartData} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
        <XAxis
          dataKey="date"
          tick={{ fill: c.textMuted, fontSize: 11 }}
          tickLine={false}
          axisLine={false}
          interval="preserveStartEnd"
        />
        <YAxis
          yAxisId="weight"
          orientation="left"
          tick={{ fill: c.textMuted, fontSize: 11 }}
          tickLine={false}
          axisLine={false}
          domain={["auto", "auto"]}
        />
        <YAxis
          yAxisId="bf"
          orientation="right"
          tick={{ fill: c.textMuted, fontSize: 11 }}
          tickLine={false}
          axisLine={false}
          domain={["auto", "auto"]}
        />
        <CartesianGrid strokeDasharray="3 3" stroke={c.grid} vertical={false} />
        <Tooltip content={<CustomTooltip />} />
        <Legend
          iconType="circle"
          iconSize={6}
          wrapperStyle={{ fontSize: "11px", color: c.textMuted, paddingTop: "8px" }}
        />
        <Line
          yAxisId="weight"
          type="monotone"
          dataKey="weight"
          name="Weight (lb)"
          stroke={c.primary}
          strokeWidth={1.5}
          dot={false}
          connectNulls
        />
        <Line
          yAxisId="bf"
          type="monotone"
          dataKey="bodyFat"
          name="Body fat %"
          stroke={c.warning}
          strokeWidth={1.5}
          dot={false}
          connectNulls
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
