"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import type { FitnessLog, RecoveryMetrics, WorkoutSession } from "@/lib/types";
import { useChartColors } from "@/lib/chart-colors";
import { daysAgoString } from "@/lib/timezone";

interface Props {
  fitnessData: FitnessLog[];
  recoveryData: RecoveryMetrics[];
  recentWorkout: WorkoutSession | null;
}

type Tab = "bodycomp" | "recovery" | "activity";
type Window = "7d" | "30d" | "90d" | "1y";

const WINDOW_DAYS: Record<Window, number> = { "7d": 7, "30d": 30, "90d": 90, "1y": 365 };

interface TooltipProps {
  active?: boolean;
  payload?: { name: string; value: number | null; color: string }[];
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
          {p.name}: {p.value != null ? p.value : "—"}
        </p>
      ))}
    </div>
  );
}

const TAB_LABELS: Record<Tab, string> = {
  bodycomp: "Body Comp",
  recovery: "Recovery",
  activity: "Activity",
};

export default function TrendsCard({ fitnessData, recoveryData, recentWorkout }: Props) {
  const [tab, setTab] = useState<Tab>("bodycomp");
  const [window, setWindow] = useState<Window>("30d");
  const c = useChartColors();

  const axisProps = {
    tick: { fill: c.textMuted, fontSize: 11 },
    tickLine: false,
    axisLine: false,
  } as const;
  const gridProps = {
    strokeDasharray: "3 3",
    stroke: c.grid,
    vertical: false,
  } as const;
  const legendWrapperStyle = { fontSize: "11px", color: c.textMuted, paddingTop: "8px" };

  const cutoff = useMemo(() => daysAgoString(WINDOW_DAYS[window]), [window]);

  const bodyCompData = useMemo(
    () =>
      fitnessData
        .filter((d) => d.date >= cutoff)
        .map((d) => ({
          date: d.date.slice(5),
          weight: d.weight_lb,
          bodyFat: d.body_fat_pct,
        })),
    [fitnessData, cutoff]
  );

  const recoveryChartData = useMemo(
    () =>
      recoveryData
        .filter((d) => d.date >= cutoff)
        .map((d) => ({
          date: d.date.slice(5),
          hrv: d.avg_hrv,
          readiness: d.readiness,
          spo2: d.spo2_avg != null && d.spo2_avg > 0 ? d.spo2_avg : null,
        })),
    [recoveryData, cutoff]
  );

  const activityChartData = useMemo(
    () =>
      recoveryData
        .filter((d) => d.date >= cutoff && (d.steps != null || d.active_cal != null))
        .map((d) => ({
          date: d.date.slice(5),
          steps: d.steps,
          activeCal: d.active_cal,
          activityScore: d.activity_score,
        })),
    [recoveryData, cutoff]
  );

  const isEmpty =
    tab === "bodycomp"
      ? bodyCompData.length === 0
      : tab === "recovery"
      ? recoveryChartData.length === 0
      : activityChartData.length === 0;

  const pillStyle = (active: boolean): React.CSSProperties => ({
    background: active ? "var(--color-surface-raised)" : "transparent",
    color: active ? "var(--color-text)" : "var(--color-text-muted)",
  });

  return (
    <div
      className="rounded-xl p-4 h-full transition-all duration-200 card-lift"
      style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)" }}
    >
      {/* Header row */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-4">
        <div className="flex gap-1">
          {(["bodycomp", "recovery", "activity"] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className="text-xs px-3 py-1 rounded-full transition-colors cursor-pointer"
              style={pillStyle(tab === t)}
            >
              {TAB_LABELS[t]}
            </button>
          ))}
        </div>
        <div className="flex gap-1">
          {(["7d", "30d", "90d", "1y"] as Window[]).map((w) => (
            <button
              key={w}
              onClick={() => setWindow(w)}
              className="text-xs px-2.5 py-1 rounded-full transition-colors cursor-pointer"
              style={pillStyle(window === w)}
            >
              {w}
            </button>
          ))}
        </div>
      </div>

      {/* Chart */}
      {isEmpty ? (
        <div className="h-48 flex items-center justify-center text-sm" style={{ color: "var(--color-text-faint)" }}>
          No data for this period
        </div>
      ) : tab === "bodycomp" ? (
        <ResponsiveContainer width="100%" height={200}>
          <ComposedChart data={bodyCompData} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
            <CartesianGrid {...gridProps} />
            <XAxis dataKey="date" {...axisProps} interval="preserveStartEnd" />
            <YAxis yAxisId="weight" orientation="left" {...axisProps} domain={["auto", "auto"]} />
            <YAxis yAxisId="bf" orientation="right" {...axisProps} domain={["auto", "auto"]} />
            <Tooltip content={<CustomTooltip />} />
            <Legend iconType="circle" iconSize={6} wrapperStyle={legendWrapperStyle} />
            <Line yAxisId="weight" type="monotone" dataKey="weight" name="Weight (lb)"
              stroke={c.primary} strokeWidth={1.5} dot={false}
              activeDot={{ r: 3, strokeWidth: 0 }} connectNulls />
            <Line yAxisId="bf" type="monotone" dataKey="bodyFat" name="Body fat %"
              stroke={c.warning} strokeWidth={1.5} dot={false}
              activeDot={{ r: 3, strokeWidth: 0 }} connectNulls />
          </ComposedChart>
        </ResponsiveContainer>
      ) : tab === "recovery" ? (
        <ResponsiveContainer width="100%" height={200}>
          <ComposedChart data={recoveryChartData} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
            <CartesianGrid {...gridProps} />
            <XAxis dataKey="date" {...axisProps} interval="preserveStartEnd" />
            <YAxis yAxisId="hrv" orientation="left" {...axisProps} domain={["auto", "auto"]} />
            <YAxis yAxisId="readiness" orientation="right" {...axisProps} domain={[0, 100]} />
            <Tooltip content={<CustomTooltip />} />
            <Legend iconType="circle" iconSize={6} wrapperStyle={legendWrapperStyle} />
            <Line yAxisId="hrv" type="monotone" dataKey="hrv" name="HRV (ms)"
              stroke={c.primary} strokeWidth={1.5} dot={false}
              activeDot={{ r: 3, strokeWidth: 0 }} connectNulls animationDuration={300} />
            <Line yAxisId="readiness" type="monotone" dataKey="readiness" name="Readiness"
              stroke={c.positive} strokeWidth={1.5} dot={false}
              activeDot={{ r: 3, strokeWidth: 0 }} connectNulls animationDuration={300} />
            <Line yAxisId="readiness" type="monotone" dataKey="spo2" name="SpO2 %"
              stroke={c.info} strokeWidth={1} dot={false}
              activeDot={{ r: 3, strokeWidth: 0 }} connectNulls animationDuration={300}
              strokeDasharray="4 2" />
          </ComposedChart>
        </ResponsiveContainer>
      ) : (
        <ResponsiveContainer width="100%" height={200}>
          <ComposedChart data={activityChartData} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
            <CartesianGrid {...gridProps} />
            <XAxis dataKey="date" {...axisProps} interval="preserveStartEnd" />
            <YAxis yAxisId="steps" orientation="left" {...axisProps} domain={[0, "auto"]}
              tickFormatter={(v) => v >= 1000 ? `${(v/1000).toFixed(0)}k` : v} />
            <YAxis yAxisId="cal" orientation="right" {...axisProps} domain={[0, "auto"]} />
            <Tooltip content={<CustomTooltip />} />
            <Legend iconType="circle" iconSize={6} wrapperStyle={legendWrapperStyle} />
            <Bar yAxisId="steps" dataKey="steps" name="Steps" fill={c.primary} opacity={0.7}
              radius={[2, 2, 0, 0]} isAnimationActive animationDuration={300} />
            <Line yAxisId="cal" type="monotone" dataKey="activeCal" name="Active Cal"
              stroke={c.warning} strokeWidth={1.5} dot={false}
              activeDot={{ r: 3, strokeWidth: 0 }} connectNulls animationDuration={300} />
          </ComposedChart>
        </ResponsiveContainer>
      )}

      {/* Recent workout row */}
      {recentWorkout && (
        <div
          className="mt-3 pt-3 flex items-center justify-between"
          style={{ borderTop: "1px solid var(--color-border)" }}
        >
          <div>
            <p className="text-xs mb-0.5" style={{ color: "var(--color-text-muted)" }}>Last workout</p>
            <p className="text-sm font-medium capitalize" style={{ color: "var(--color-text)" }}>{recentWorkout.activity}</p>
          </div>
          <div className="text-right">
            <p className="text-xs tabular-nums" style={{ color: "var(--color-text-muted)" }}>
              {recentWorkout.duration_mins != null && <span>{recentWorkout.duration_mins}m</span>}
              {recentWorkout.calories != null && (
                <span>{recentWorkout.duration_mins != null ? " · " : ""}{recentWorkout.calories} cal</span>
              )}
              {recentWorkout.avg_hr != null && <span> · {recentWorkout.avg_hr} bpm</span>}
            </p>
            <p className="text-xs mt-0.5" style={{ color: "var(--color-text-faint)" }}>{recentWorkout.date}</p>
          </div>
          <Link
            href="/fitness"
            className="ml-4 text-xs transition-colors"
            style={{ color: "var(--color-text-muted)" }}
            onClick={(e) => e.stopPropagation()}
          >
            View all →
          </Link>
        </div>
      )}
    </div>
  );
}
