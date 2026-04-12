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
  windowLabel?: string;
}

interface TooltipPayload {
  name: string;
  value: number;
  color: string;
}

interface TooltipProps {
  active?: boolean;
  payload?: TooltipPayload[];
  label?: string;
}

function fmtHrs(v: number) {
  const h = Math.floor(v);
  const m = Math.round((v - h) * 60);
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function CustomTooltip({ active, payload, label }: TooltipProps) {
  if (!active || !payload?.length) return null;
  return (
    <div
      className="rounded-lg px-3 py-2 text-xs"
      style={{ background: "var(--color-surface-raised)", border: "1px solid var(--color-border)" }}
    >
      <p className="mb-1" style={{ color: "var(--color-text-muted)" }}>{label}</p>
      {payload.map((p) => (
        <p key={p.name} style={{ color: p.color }}>
          {p.name}: {p.value != null ? fmtHrs(p.value) : "—"}
        </p>
      ))}
    </div>
  );
}

export default function RecoveryTrends({ data, windowLabel }: Props) {
  if (data.length === 0) {
    return (
      <p className="text-sm py-4" style={{ color: "var(--color-text-faint)" }}>
        No trend data
      </p>
    );
  }

  const chartData = data.map((d) => ({
    date: d.date.slice(5),
    deep:  d.deep_hrs  != null ? parseFloat(d.deep_hrs.toFixed(1))  : null,
    rem:   d.rem_hrs   != null ? parseFloat(d.rem_hrs.toFixed(1))   : null,
    light: d.light_hrs != null ? parseFloat(d.light_hrs.toFixed(1)) : null,
  }));

  const label = windowLabel ? `Sleep — ${windowLabel}` : `Sleep — ${data.length}d`;

  return (
    <div>
      <p className="text-xs uppercase tracking-widest mb-3" style={{ color: "var(--color-text-muted)", letterSpacing: "0.07em" }}>
        {label}
      </p>
      <ResponsiveContainer width="100%" height={160}>
        <BarChart data={chartData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
          <XAxis
            dataKey="date"
            tick={{ fill: "var(--color-text-muted)", fontSize: 10 }}
            tickLine={false}
            axisLine={false}
            interval="preserveStartEnd"
          />
          <YAxis
            tick={{ fill: "var(--color-text-muted)", fontSize: 10 }}
            tickLine={false}
            axisLine={false}
          />
          <Tooltip content={<CustomTooltip />} />
          {/* Stack order: Deep (bottom) → REM → Light (top) — matches sleep-stage-chart.tsx */}
          <Bar dataKey="deep"  name="Deep"  fill="#6366F1" stackId="s" radius={[0, 0, 0, 0]} isAnimationActive animationDuration={300} />
          <Bar dataKey="rem"   name="REM"   fill="#A78BFA" stackId="s" radius={[0, 0, 0, 0]} isAnimationActive animationDuration={300} />
          <Bar dataKey="light" name="Light" fill="#38BDF8" stackId="s" radius={[3, 3, 0, 0]} isAnimationActive animationDuration={300} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
