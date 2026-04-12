"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import type { RecoveryMetrics } from "@/lib/types";

interface Props {
  data: RecoveryMetrics[];
}

interface TooltipProps {
  active?: boolean;
  payload?: { name: string; value: number; color: string }[];
  label?: string;
}

function CustomTooltip({ active, payload, label }: TooltipProps) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-2 text-xs">
      <p className="text-neutral-400 mb-1">{label}</p>
      {payload.map((p) => (
        <p key={p.name} style={{ color: p.color }}>
          {p.name}: {p.value != null ? p.value : "—"}
        </p>
      ))}
    </div>
  );
}

const axisProps = {
  tick: { fill: "#737373", fontSize: 10 },
  tickLine: false,
  axisLine: false,
} as const;

const gridProps = {
  strokeDasharray: "3 3",
  stroke: "#262626",
  vertical: false,
} as const;

export default function RecoveryTrends({ data }: Props) {
  if (data.length === 0) {
    return <p className="text-sm text-neutral-600 py-4">No trend data</p>;
  }

  const chartData = data.map((d) => ({
    date: d.date.slice(5),
    light: d.light_hrs != null ? parseFloat(d.light_hrs.toFixed(1)) : null,
    deep: d.deep_hrs != null ? parseFloat(d.deep_hrs.toFixed(1)) : null,
    rem: d.rem_hrs != null ? parseFloat(d.rem_hrs.toFixed(1)) : null,
  }));

  return (
    <div className="mt-4">
      <p className="text-xs text-neutral-500 mb-2">Sleep — 14 days</p>
      <ResponsiveContainer width="100%" height={160}>
        <BarChart data={chartData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
          <CartesianGrid {...gridProps} />
          <XAxis dataKey="date" {...axisProps} interval="preserveStartEnd" />
          <YAxis {...axisProps} domain={[0, "auto"]} />
          <Tooltip content={<CustomTooltip />} />
          <Bar dataKey="light" name="Light (h)" stackId="sleep" fill="#6366f1" radius={[0, 0, 0, 0]} isAnimationActive animationDuration={600} />
          <Bar dataKey="deep" name="Deep (h)" stackId="sleep" fill="#3b82f6" radius={[0, 0, 0, 0]} isAnimationActive animationDuration={600} />
          <Bar dataKey="rem" name="REM (h)" stackId="sleep" fill="#06b6d4" radius={[2, 2, 0, 0]} isAnimationActive animationDuration={600} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
