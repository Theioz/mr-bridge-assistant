"use client";

import { useState, useEffect } from "react";
import {
  ComposedChart,
  LineChart, Line,
  AreaChart, Area,
  BarChart, Bar,
  XAxis, YAxis,
  CartesianGrid, Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import type { RecoveryMetrics } from "@/lib/types";
import { useChartColors, type ChartColors } from "@/lib/chart-colors";

// ── Types ────────────────────────────────────────────────────────────────────

interface FitnessPoint {
  date: string;
  weight_lb: number | null;
  body_fat_pct: number | null;
}

interface Props {
  recovery: RecoveryMetrics | null;
  trends: RecoveryMetrics[];
  fitnessData: FitnessPoint[];
  windowLabel: string;
}

type FitnessTab = "weight" | "bodyfat" | "steps" | "calories";
type SleepTab   = "stages" | "hrv" | "rhr" | "spo2";

// ── Recharts shared config ───────────────────────────────────────────────────

const CHART_H = 180;

function buildChartConfig(c: ChartColors) {
  return {
    TOOLTIP_STYLE: {
      contentStyle: { background: c.tooltipBg, border: `1px solid ${c.tooltipBorder}`, borderRadius: 8 },
      labelStyle:   { color: c.text, fontSize: 12 },
      itemStyle:    { color: c.textMuted, fontSize: 11 },
    },
    GRID:  { strokeDasharray: "3 3", stroke: c.grid, vertical: false as const },
    AXIS:  { stroke: c.axis, tick: { fill: c.textMuted, fontSize: 10 }, tickLine: false as const, axisLine: false as const },
    AVG_LINE: { stroke: c.textMuted, strokeWidth: 1.5, strokeDasharray: "4 2", dot: false },
    LEGEND_STYLE: { fontSize: 10, color: c.textMuted, paddingBottom: 4 },
  };
}

// ── Score helpers ────────────────────────────────────────────────────────────

function scoreColor(score: number | null): string {
  if (score == null) return "var(--color-text-muted)";
  if (score >= 80)   return "var(--color-positive)";
  if (score >= 60)   return "var(--color-warning)";
  return "var(--color-danger)";
}

function scorePanelStyle(score: number | null): React.CSSProperties {
  if (score == null)
    return { background: "var(--color-surface-raised)", borderRadius: 12, padding: "16px 20px" };
  const subtle = score >= 80 ? "var(--color-positive-subtle)"
               : score >= 60 ? "var(--warning-subtle)"
               : "var(--color-danger-subtle)";
  const subtleStrong = score >= 80 ? "var(--color-positive-subtle-strong)"
                     : score >= 60 ? "var(--warning-subtle-strong)"
                     : "var(--color-danger-subtle)";
  return {
    background: subtle,
    border: `1px solid ${subtleStrong}`,
    borderRadius: 12,
    padding: "16px 20px",
  };
}

function accentColor(score: number | null): string {
  if (score == null) return "var(--color-border)";
  if (score >= 80)   return "var(--color-positive)";
  if (score >= 60)   return "var(--color-warning)";
  return "var(--color-danger)";
}

function statusText(score: number | null): string {
  if (score == null) return "No readiness data";
  if (score >= 85)   return "Recovery optimal — push hard today";
  if (score >= 70)   return "Recovery good — normal training";
  if (score >= 55)   return "Recovery moderate — moderate effort";
  if (score >= 40)   return "Readiness low — consider deload";
  return "Readiness critical — rest day recommended";
}

// ── Formatting helpers ───────────────────────────────────────────────────────

function fmtHrs(hrs: number | null | undefined): string {
  if (hrs == null) return "—";
  const h = Math.floor(hrs);
  const m = Math.round((hrs - h) * 60);
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function fmtNum(n: number | null | undefined, decimals = 0): string {
  if (n == null) return "—";
  return decimals > 0 ? n.toFixed(decimals) : Math.round(n).toLocaleString();
}

function metaVal(recovery: RecoveryMetrics, key: string): number | string | null {
  const val = recovery.metadata?.[key];
  if (val == null) return null;
  if (typeof val === "number" || typeof val === "string") return val;
  return null;
}

// ── Sub-components ───────────────────────────────────────────────────────────

interface MetricProps {
  label: string;
  value: string;
  unit?: string;
  children?: React.ReactNode;
}

function Metric({ label, value, unit, children }: MetricProps) {
  return (
    <div className="flex items-center gap-2 min-w-0">
      <span className="text-xs shrink-0 tabular-nums" style={{ color: "var(--color-text-muted)", width: "4.5rem" }}>
        {label}
      </span>
      <span className="text-sm shrink-0 tabular-nums" style={{ color: "var(--color-text)" }}>
        {value}
        {unit && value !== "—" && (
          <span className="text-xs ml-0.5" style={{ color: "var(--color-text-muted)" }}>{unit}</span>
        )}
      </span>
      {children}
    </div>
  );
}

interface TabPillsProps<T extends string> {
  tabs: { key: T; label: string }[];
  active: T;
  onSelect: (key: T) => void;
}

function TabPills<T extends string>({ tabs, active, onSelect }: TabPillsProps<T>) {
  return (
    <div className="flex items-center gap-1 flex-wrap">
      {tabs.map(({ key, label }) => (
        <button
          key={key}
          onClick={() => onSelect(key)}
          className="px-2.5 py-1 rounded text-xs font-medium transition-colors cursor-pointer"
          style={{
            background: active === key ? "var(--color-primary)" : "var(--color-surface-raised)",
            color:      active === key ? "var(--color-text-on-cta)" : "var(--color-text-muted)",
          }}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

// ── Trailing 7-day average ───────────────────────────────────────────────────

function trailing7Avg(data: { value: number | null }[]): (number | null)[] {
  return data.map((_, i) => {
    const slice = data.slice(Math.max(0, i - 6), i + 1);
    const vals = slice.map(d => d.value).filter((v): v is number => v != null);
    if (vals.length === 0) return null;
    return parseFloat((vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(2));
  });
}

// ── Fitness chart panel ───────────────────────────────────────────────────────

const FITNESS_TABS: { key: FitnessTab; label: string }[] = [
  { key: "weight",   label: "Weight"    },
  { key: "bodyfat",  label: "Body Fat"  },
  { key: "steps",    label: "Steps"     },
  { key: "calories", label: "Calories"  },
];

function FitnessChartPanel({
  fitnessData,
  trends,
  windowLabel,
  animate,
}: {
  fitnessData: FitnessPoint[];
  trends: RecoveryMetrics[];
  windowLabel: string;
  animate: boolean;
}) {
  const [tab, setTab] = useState<FitnessTab>("weight");
  const c = useChartColors();
  const { TOOLTIP_STYLE, GRID, AXIS, AVG_LINE, LEGEND_STYLE } = buildChartConfig(c);

  const weightDataRaw = fitnessData.map((d) => ({ date: d.date.slice(5), value: d.weight_lb }));
  const weightAvgs    = trailing7Avg(weightDataRaw);
  const weightData    = weightDataRaw.map((d, i) => ({ ...d, avg: weightAvgs[i] }));

  const bfDataRaw  = fitnessData
    .filter((d) => d.body_fat_pct != null)
    .map((d) => ({ date: d.date.slice(5), value: d.body_fat_pct }));
  const bfAvgs     = trailing7Avg(bfDataRaw);
  const bfData     = bfDataRaw.map((d, i) => ({ ...d, avg: bfAvgs[i] }));

  const stepsDataRaw = trends.map((d) => ({ date: d.date.slice(5), value: d.steps }));
  const stepsAvgs    = trailing7Avg(stepsDataRaw);
  const stepsData    = stepsDataRaw.map((d, i) => ({ ...d, avg: stepsAvgs[i] }));

  const calDataRaw = trends.map((d) => ({ date: d.date.slice(5), value: d.active_cal }));
  const calAvgs    = trailing7Avg(calDataRaw);
  const calData    = calDataRaw.map((d, i) => ({ ...d, avg: calAvgs[i] }));

  const chartLabel: Record<FitnessTab, string> = {
    weight:   `Weight — ${windowLabel}`,
    bodyfat:  `Body Fat — ${windowLabel}`,
    steps:    `Steps — ${windowLabel}`,
    calories: `Active Cal — ${windowLabel}`,
  };

  return (
    <div className="flex flex-col gap-3 min-w-0">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <p className="text-xs uppercase tracking-widest" style={{ color: "var(--color-text-muted)", letterSpacing: "0.07em" }}>
          {chartLabel[tab]}
        </p>
        <TabPills tabs={FITNESS_TABS} active={tab} onSelect={setTab} />
      </div>

      {tab === "weight" && (
        <ResponsiveContainer width="100%" height={CHART_H}>
          <LineChart data={weightData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
            <CartesianGrid {...GRID} />
            <XAxis dataKey="date" {...AXIS} interval="preserveStartEnd" />
            <YAxis {...AXIS} domain={["auto", "auto"]} />
            <Tooltip {...TOOLTIP_STYLE} formatter={(v: number) => `${v} lb`} />
            <Legend verticalAlign="top" height={20} wrapperStyle={LEGEND_STYLE} />
            <Line type="monotone" dataKey="value" name="Weight" stroke={c.primary} strokeWidth={2} dot={false}
              activeDot={{ r: 4, fill: c.primary, strokeWidth: 0 }} connectNulls
              isAnimationActive={animate} animationDuration={300} />
            <Line type="monotone" dataKey="avg" name="7d avg" {...AVG_LINE} connectNulls
              isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      )}

      {tab === "bodyfat" && (
        <ResponsiveContainer width="100%" height={CHART_H}>
          <LineChart data={bfData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
            <CartesianGrid {...GRID} />
            <XAxis dataKey="date" {...AXIS} interval="preserveStartEnd" />
            <YAxis {...AXIS} domain={["auto", "auto"]} tickFormatter={(v) => `${v}%`} />
            <Tooltip {...TOOLTIP_STYLE} formatter={(v: number) => `${(v as number).toFixed(1)}%`} />
            <Legend verticalAlign="top" height={20} wrapperStyle={LEGEND_STYLE} />
            <Line type="monotone" dataKey="value" name="Body Fat" stroke={c.positive} strokeWidth={2} dot={false}
              activeDot={{ r: 4, fill: c.positive, strokeWidth: 0 }} connectNulls
              isAnimationActive={animate} animationDuration={300} />
            <Line type="monotone" dataKey="avg" name="7d avg" {...AVG_LINE} connectNulls
              isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      )}

      {tab === "steps" && (
        <ResponsiveContainer width="100%" height={CHART_H}>
          <ComposedChart data={stepsData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
            <CartesianGrid {...GRID} />
            <XAxis dataKey="date" {...AXIS} interval="preserveStartEnd" />
            <YAxis {...AXIS} tickFormatter={(v) => v >= 1000 ? `${(v/1000).toFixed(0)}k` : v} />
            <Tooltip {...TOOLTIP_STYLE} formatter={(v: number) => v.toLocaleString()} />
            <Legend verticalAlign="top" height={20} wrapperStyle={LEGEND_STYLE} />
            <Bar dataKey="value" name="Steps" fill={c.info} radius={[3, 3, 0, 0]}
              isAnimationActive={animate} animationDuration={300} />
            <Line type="monotone" dataKey="avg" name="7d avg" {...AVG_LINE} connectNulls
              isAnimationActive={false} />
          </ComposedChart>
        </ResponsiveContainer>
      )}

      {tab === "calories" && (
        <ResponsiveContainer width="100%" height={CHART_H}>
          <ComposedChart data={calData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
            <defs>
              <linearGradient id="calGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor={c.warning} stopOpacity={0.25} />
                <stop offset="95%" stopColor={c.warning} stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid {...GRID} />
            <XAxis dataKey="date" {...AXIS} interval="preserveStartEnd" />
            <YAxis {...AXIS} />
            <Tooltip {...TOOLTIP_STYLE} formatter={(v: number) => `${Math.round(v)} kcal`} />
            <Legend verticalAlign="top" height={20} wrapperStyle={LEGEND_STYLE} />
            <Area type="monotone" dataKey="value" name="Active Cal" stroke={c.warning} strokeWidth={2}
              fill="url(#calGrad)" dot={false} connectNulls
              isAnimationActive={animate} animationDuration={300} />
            <Line type="monotone" dataKey="avg" name="7d avg" {...AVG_LINE} connectNulls
              isAnimationActive={false} />
          </ComposedChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

// ── Sleep chart panel ─────────────────────────────────────────────────────────

function SleepChartPanel({
  trends,
  windowLabel,
  animate,
}: {
  trends: RecoveryMetrics[];
  windowLabel: string;
  animate: boolean;
}) {
  const hasSpo2 = trends.some((d) => d.spo2_avg != null && d.spo2_avg > 0);

  const SLEEP_TABS: { key: SleepTab; label: string }[] = [
    { key: "stages", label: "Stages" },
    { key: "hrv",    label: "HRV"    },
    { key: "rhr",    label: "RHR"    },
    ...(hasSpo2 ? [{ key: "spo2" as SleepTab, label: "SpO₂" }] : []),
  ];

  const [tab, setTab] = useState<SleepTab>("stages");
  const c = useChartColors();
  const { TOOLTIP_STYLE, GRID, AXIS } = buildChartConfig(c);

  const stagesData = trends.map((d) => ({
    date:  d.date.slice(5),
    deep:  d.deep_hrs  != null ? parseFloat(d.deep_hrs.toFixed(1))  : null,
    rem:   d.rem_hrs   != null ? parseFloat(d.rem_hrs.toFixed(1))   : null,
    light: d.light_hrs != null ? parseFloat(d.light_hrs.toFixed(1)) : null,
  }));
  const hrvData    = trends.map((d) => ({ date: d.date.slice(5), value: d.avg_hrv }));
  const rhrData    = trends.map((d) => ({ date: d.date.slice(5), value: d.resting_hr }));
  const spo2Data   = trends.map((d) => ({ date: d.date.slice(5), value: d.spo2_avg }));

  const chartLabel: Record<SleepTab, string> = {
    stages: `Sleep Stages — ${windowLabel}`,
    hrv:    `HRV — ${windowLabel}`,
    rhr:    `Resting HR — ${windowLabel}`,
    spo2:   `SpO₂ — ${windowLabel}`,
  };

  return (
    <div className="flex flex-col gap-3 min-w-0">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <p className="text-xs uppercase tracking-widest" style={{ color: "var(--color-text-muted)", letterSpacing: "0.07em" }}>
          {chartLabel[tab]}
        </p>
        <TabPills tabs={SLEEP_TABS} active={tab} onSelect={setTab} />
      </div>

      {tab === "stages" && (
        <ResponsiveContainer width="100%" height={CHART_H}>
          <BarChart data={stagesData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
            <CartesianGrid {...GRID} />
            <XAxis dataKey="date" {...AXIS} interval="preserveStartEnd" />
            <YAxis {...AXIS} />
            <Tooltip {...TOOLTIP_STYLE}
              formatter={(v: number, name: string) => {
                const h = Math.floor(v); const m = Math.round((v - h) * 60);
                return [m > 0 ? `${h}h ${m}m` : `${h}h`, name];
              }}
            />
            <Bar dataKey="deep"  name="Deep"  fill={c.primary} stackId="s" radius={[0,0,0,0]} isAnimationActive={animate} animationDuration={300} />
            <Bar dataKey="rem"   name="REM"   fill={c.secondary} stackId="s" radius={[0,0,0,0]} isAnimationActive={animate} animationDuration={300} />
            <Bar dataKey="light" name="Light" fill={c.info} stackId="s" radius={[3,3,0,0]} isAnimationActive={animate} animationDuration={300} />
          </BarChart>
        </ResponsiveContainer>
      )}

      {tab === "hrv" && (
        <ResponsiveContainer width="100%" height={CHART_H}>
          <AreaChart data={hrvData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
            <defs>
              <linearGradient id="hrvGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor={c.positive} stopOpacity={0.25} />
                <stop offset="95%" stopColor={c.positive} stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid {...GRID} />
            <XAxis dataKey="date" {...AXIS} interval="preserveStartEnd" />
            <YAxis {...AXIS} />
            <Tooltip {...TOOLTIP_STYLE} formatter={(v: number) => [`${Math.round(v)} ms`, "HRV"]} />
            <Area type="monotone" dataKey="value" stroke={c.positive} strokeWidth={2}
              fill="url(#hrvGrad)" dot={false} connectNulls
              isAnimationActive={animate} animationDuration={300} />
          </AreaChart>
        </ResponsiveContainer>
      )}

      {tab === "rhr" && (
        <ResponsiveContainer width="100%" height={CHART_H}>
          <LineChart data={rhrData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
            <CartesianGrid {...GRID} />
            <XAxis dataKey="date" {...AXIS} interval="preserveStartEnd" />
            <YAxis {...AXIS} domain={["auto", "auto"]} />
            <Tooltip {...TOOLTIP_STYLE} formatter={(v: number) => [`${Math.round(v)} bpm`, "RHR"]} />
            <Line type="monotone" dataKey="value" stroke={c.danger} strokeWidth={2} dot={false}
              activeDot={{ r: 4, fill: c.danger, strokeWidth: 0 }} connectNulls
              isAnimationActive={animate} animationDuration={300} />
          </LineChart>
        </ResponsiveContainer>
      )}

      {tab === "spo2" && (
        <ResponsiveContainer width="100%" height={CHART_H}>
          <LineChart data={spo2Data} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
            <CartesianGrid {...GRID} />
            <XAxis dataKey="date" {...AXIS} interval="preserveStartEnd" />
            <YAxis {...AXIS} domain={["auto", "auto"]} tickFormatter={(v) => `${v}%`} />
            <Tooltip {...TOOLTIP_STYLE} formatter={(v: number) => [`${v.toFixed(1)}%`, "SpO₂"]} />
            <Line type="monotone" dataKey="value" stroke={c.info} strokeWidth={2} dot={false}
              activeDot={{ r: 4, fill: c.info, strokeWidth: 0 }} connectNulls
              isAnimationActive={animate} animationDuration={300} />
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function HealthBreakdown({ recovery, trends, fitnessData, windowLabel }: Props) {
  const [animate, setAnimate] = useState(true);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setAnimate(!mq.matches);
  }, []);

  const accentBg = accentColor(recovery?.readiness ?? null);

  return (
    <div
      className="rounded-xl overflow-hidden flex flex-col"
      style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)" }}
    >
      {/* Colored top bar */}
      <div style={{ height: 3, background: accentBg, flexShrink: 0 }} />

      <div className="p-5 flex flex-col gap-5">
        {/* Header */}
        <p className="text-xs uppercase tracking-widest" style={{ color: "var(--color-text-muted)", letterSpacing: "0.07em" }}>
          Health Breakdown
        </p>

        {recovery ? (
          <>
            {/* Score panel */}
            <div style={scorePanelStyle(recovery.readiness)}>
              <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
                {/* Readiness */}
                <div>
                  <p className="text-xs uppercase tracking-widest mb-1" style={{ color: "var(--color-text-muted)", letterSpacing: "0.06em" }}>
                    Readiness
                  </p>
                  <span className="font-heading font-bold leading-none" style={{ fontSize: 52, color: scoreColor(recovery.readiness) }}>
                    {recovery.readiness ?? "—"}
                  </span>
                </div>

                {/* Sleep */}
                <div className="pb-1">
                  <p className="text-xs uppercase tracking-widest mb-1" style={{ color: "var(--color-text-muted)", letterSpacing: "0.06em" }}>
                    Sleep
                  </p>
                  <span className="font-heading font-bold leading-none" style={{ fontSize: 40, color: scoreColor(recovery.sleep_score) }}>
                    {recovery.sleep_score ?? "—"}
                  </span>
                </div>

                {/* Activity */}
                {recovery.activity_score != null && (
                  <div className="pb-1">
                    <p className="text-xs uppercase tracking-widest mb-1" style={{ color: "var(--color-text-muted)", letterSpacing: "0.06em" }}>
                      Activity
                    </p>
                    <span className="font-heading font-bold leading-none" style={{ fontSize: 40, color: scoreColor(recovery.activity_score) }}>
                      {recovery.activity_score}
                    </span>
                  </div>
                )}

                {/* Status + source */}
                <div className="ml-auto text-right pb-1">
                  <p className="text-xs font-medium" style={{ color: scoreColor(recovery.readiness) }}>
                    {statusText(recovery.readiness)}
                  </p>
                  <p className="text-xs mt-1" style={{ color: "var(--color-text-faint)" }}>
                    {recovery.source ?? "Oura"} · {recovery.date}
                  </p>
                </div>
              </div>
            </div>

            {/* Metrics grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-x-6 gap-y-2.5">
              <Metric label="HRV"         value={fmtNum(recovery.avg_hrv)}      unit="ms"  />
              <Metric label="RHR"         value={fmtNum(recovery.resting_hr)}   unit="bpm" />
              <Metric label="Total Sleep" value={fmtHrs(recovery.total_sleep_hrs)} />
              <Metric label="Deep"        value={fmtHrs(recovery.deep_hrs)}     />
              <Metric label="REM"         value={fmtHrs(recovery.rem_hrs)}      />
              <Metric label="Steps"       value={recovery.steps != null ? recovery.steps.toLocaleString() : "—"} />
            </div>

            {/* Stress row */}
            {(metaVal(recovery, "stress_high_mins") != null || metaVal(recovery, "stress_day_summary") != null) && (
              <div
                className="flex flex-wrap items-center gap-x-4 gap-y-1 pt-3 text-xs"
                style={{ borderTop: "1px solid var(--color-border)", color: "var(--color-text-muted)" }}
              >
                <span className="uppercase tracking-widest" style={{ letterSpacing: "0.07em" }}>Stress</span>
                {metaVal(recovery, "stress_high_mins") != null && (
                  <span className="tabular-nums" style={{ color: "var(--color-text)" }}>
                    {metaVal(recovery, "stress_high_mins")}m high
                    {metaVal(recovery, "stress_recovery_mins") != null && (
                      <> · {metaVal(recovery, "stress_recovery_mins")}m recovery</>
                    )}
                  </span>
                )}
                {metaVal(recovery, "stress_day_summary") != null && (
                  <span className="capitalize" style={{ color: "var(--color-text-muted)" }}>
                    {String(metaVal(recovery, "stress_day_summary")).replace(/_/g, " ")}
                  </span>
                )}
                {metaVal(recovery, "resilience_level") != null && (
                  <span className="ml-auto capitalize" style={{ color: "var(--color-text-muted)" }}>
                    Resilience: {String(metaVal(recovery, "resilience_level")).replace(/_/g, " ")}
                  </span>
                )}
              </div>
            )}

            {/* Divider */}
            <div style={{ borderTop: "1px solid var(--color-border)" }} />

            {/* Two chart panels */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Fitness */}
              <div className="min-w-0">
                <FitnessChartPanel
                  fitnessData={fitnessData}
                  trends={trends}
                  windowLabel={windowLabel}
                  animate={animate}
                />
              </div>

              {/* Sleep (border-left only on desktop) */}
              <div className="min-w-0 lg:pl-6 lg:border-l" style={{ borderColor: "var(--color-border)" }}>
                <SleepChartPanel trends={trends} windowLabel={windowLabel} animate={animate} />
              </div>
            </div>
          </>
        ) : (
          <div
            className="flex items-center justify-center py-10 rounded-xl"
            style={{ background: "var(--color-surface-raised)" }}
          >
            <p className="text-sm" style={{ color: "var(--color-text-faint)" }}>
              No recovery data — run a sync to pull latest from Oura
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
