"use client";

import { useState } from "react";
import type { RecoveryMetrics } from "@/lib/types";
import { BarSeries, ChartFrame, StackedBars, TrendLine } from "@/components/charts/primitives";
import { formatDate } from "@/lib/chart-utils";
import { todayString } from "@/lib/timezone";

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
  weightGoal?: number | null;
  bodyFatGoal?: number | null;
  weeklyActiveCalGoal?: number | null;
}

type FitnessTab = "weight" | "bodyfat" | "steps" | "calories";
type SleepTab = "stages" | "hrv" | "rhr" | "spo2";

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

function trailingAvg(values: (number | null)[]): number | null {
  const nums = values.filter((v): v is number => v != null);
  if (nums.length === 0) return null;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function scoreText(score: number | null): string {
  if (score == null) return "—";
  if (score >= 85) return "optimal · push hard today";
  if (score >= 70) return "good · normal training";
  if (score >= 55) return "moderate · moderate effort";
  if (score >= 40) return "low · consider deload";
  return "critical · rest day recommended";
}

// ── Sub-components ───────────────────────────────────────────────────────────

interface MetricProps {
  label: string;
  value: string;
  unit?: string;
}

function Metric({ label, value, unit }: MetricProps) {
  return (
    <div className="flex items-baseline" style={{ gap: "var(--space-2)", minWidth: 0 }}>
      <span
        className="tnum"
        style={{
          fontSize: "var(--t-micro)",
          color: "var(--color-text-muted)",
          letterSpacing: "0.04em",
          textTransform: "uppercase",
          flexShrink: 0,
          width: "5rem",
        }}
      >
        {label}
      </span>
      <span
        className="tnum"
        style={{
          fontSize: "var(--t-body)",
          color: "var(--color-text)",
        }}
      >
        {value}
        {unit && value !== "—" && (
          <span
            style={{
              fontSize: "var(--t-micro)",
              marginLeft: 3,
              color: "var(--color-text-muted)",
            }}
          >
            {unit}
          </span>
        )}
      </span>
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
    <div
      className="flex items-center flex-wrap"
      style={{
        gap: 2,
        padding: 2,
        border: "1px solid var(--rule)",
        borderRadius: "var(--r-1)",
      }}
    >
      {tabs.map(({ key, label }) => {
        const isActive = active === key;
        return (
          <button
            key={key}
            onClick={() => onSelect(key)}
            className="cursor-pointer"
            style={{
              minHeight: 32,
              minWidth: 44,
              padding: "0 var(--space-3)",
              background: isActive ? "var(--accent)" : "transparent",
              color: isActive ? "var(--color-text-on-cta)" : "var(--color-text-muted)",
              border: "none",
              borderRadius: "var(--r-1)",
              fontSize: "var(--t-micro)",
              fontWeight: isActive ? 600 : 500,
              transition:
                "background var(--motion-fast) var(--ease-out-quart), color var(--motion-fast) var(--ease-out-quart)",
            }}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

// ── Fitness chart panel ──────────────────────────────────────────────────────

const FITNESS_TABS: { key: FitnessTab; label: string }[] = [
  { key: "weight", label: "Weight" },
  { key: "bodyfat", label: "Body Fat" },
  { key: "steps", label: "Steps" },
  { key: "calories", label: "Calories" },
];

function FitnessChartPanel({
  fitnessData,
  trends,
  windowLabel,
  weightGoal,
  bodyFatGoal,
  weeklyActiveCalGoal,
}: {
  fitnessData: FitnessPoint[];
  trends: RecoveryMetrics[];
  windowLabel: string;
  weightGoal?: number | null;
  bodyFatGoal?: number | null;
  weeklyActiveCalGoal?: number | null;
}) {
  const [tab, setTab] = useState<FitnessTab>("weight");

  const today = todayString();

  function todayIdx(dates: string[]): number {
    if (dates.length === 0) return -1;
    return dates[dates.length - 1] === today ? dates.length - 1 : -1;
  }

  const wdata = fitnessData.filter((d) => d.weight_lb != null);
  const bfdata = fitnessData.filter((d) => d.body_fat_pct != null);

  const wLabels = wdata.map((d) => formatDate(d.date));
  const wValues = wdata.map((d) => d.weight_lb as number);
  const wLatest = wValues[wValues.length - 1];
  const wAvg = trailingAvg(wValues);

  const bfLabels = bfdata.map((d) => formatDate(d.date));
  const bfValues = bfdata.map((d) => d.body_fat_pct as number);
  const bfLatest = bfValues[bfValues.length - 1];
  const bfAvg = trailingAvg(bfValues);

  const stepsLabels = trends.map((d) => formatDate(d.date));
  const stepsValues = trends.map((d) => d.steps);
  const stepsLatest = stepsValues[stepsValues.length - 1] ?? null;
  const stepsAvg = trailingAvg(stepsValues);

  const calLabels = trends.map((d) => formatDate(d.date));
  const calValues = trends.map((d) => d.active_cal);
  const calLatest = calValues[calValues.length - 1] ?? null;
  const calAvg = trailingAvg(calValues);

  const wIdx = todayIdx(wdata.map((d) => d.date));
  const bfIdx = todayIdx(bfdata.map((d) => d.date));
  const trendsIdx = todayIdx(trends.map((d) => d.date));

  const label = `${
    {
      weight: "Weight",
      bodyfat: "Body fat",
      steps: "Steps",
      calories: "Active calories",
    }[tab]
  } · ${windowLabel}`;

  const value: React.ReactNode = (() => {
    switch (tab) {
      case "weight":
        return wLatest != null
          ? `${wLatest.toFixed(1)} lb${wAvg != null ? ` · avg ${wAvg.toFixed(1)}` : ""}`
          : "—";
      case "bodyfat":
        return bfLatest != null
          ? `${bfLatest.toFixed(1)}%${bfAvg != null ? ` · avg ${bfAvg.toFixed(1)}` : ""}`
          : "—";
      case "steps":
        return stepsLatest != null
          ? `${stepsLatest.toLocaleString()}${
              stepsAvg != null ? ` · avg ${Math.round(stepsAvg).toLocaleString()}` : ""
            }`
          : "—";
      case "calories":
        return calLatest != null
          ? `${Math.round(calLatest).toLocaleString()} kcal${
              calAvg != null ? ` · avg ${Math.round(calAvg).toLocaleString()}` : ""
            }`
          : "—";
    }
  })();

  return (
    <ChartFrame
      label={label}
      value={value}
      action={<TabPills tabs={FITNESS_TABS} active={tab} onSelect={setTab} />}
    >
      {tab === "weight" &&
        (wValues.length === 0 ? (
          <Empty />
        ) : (
          <TrendLine
            labels={wLabels}
            values={wValues}
            todayIndex={wIdx}
            refLines={[
              ...(weightGoal != null && weightGoal > 0
                ? [
                    {
                      y: weightGoal,
                      label: `Goal ${weightGoal} lb`,
                      dashed: true,
                    },
                  ]
                : wAvg != null
                  ? [{ y: wAvg, label: `avg ${wAvg.toFixed(1)}`, dashed: true }]
                  : []),
            ]}
            formatValue={(v) => `${v.toFixed(1)} lb`}
            ariaLabel={`Weight trend ${windowLabel}`}
            endpointRight={wIdx >= 0 ? "Today" : wLabels[wLabels.length - 1]}
          />
        ))}
      {tab === "bodyfat" &&
        (bfValues.length === 0 ? (
          <Empty />
        ) : (
          <TrendLine
            labels={bfLabels}
            values={bfValues}
            todayIndex={bfIdx}
            refLines={[
              ...(bodyFatGoal != null && bodyFatGoal > 0
                ? [
                    {
                      y: bodyFatGoal,
                      label: `Goal ${bodyFatGoal}%`,
                      dashed: true,
                    },
                  ]
                : bfAvg != null
                  ? [{ y: bfAvg, label: `avg ${bfAvg.toFixed(1)}%`, dashed: true }]
                  : []),
            ]}
            formatValue={(v) => `${v.toFixed(1)}%`}
            ariaLabel={`Body fat trend ${windowLabel}`}
            endpointRight={bfIdx >= 0 ? "Today" : bfLabels[bfLabels.length - 1]}
          />
        ))}
      {tab === "steps" &&
        (stepsValues.every((v) => v == null) ? (
          <Empty />
        ) : (
          <BarSeries
            labels={stepsLabels}
            values={stepsValues}
            todayIndex={trendsIdx}
            refLines={
              stepsAvg != null
                ? [
                    {
                      y: stepsAvg,
                      label: `avg ${Math.round(stepsAvg).toLocaleString()}`,
                      dashed: true,
                    },
                  ]
                : []
            }
            formatValue={(v) => `${v.toLocaleString()} steps`}
            ariaLabel={`Steps trend ${windowLabel}`}
            opacity={() => 0.55}
            endpointRight={trendsIdx >= 0 ? "Today" : stepsLabels[stepsLabels.length - 1]}
          />
        ))}
      {tab === "calories" &&
        (calValues.every((v) => v == null) ? (
          <Empty />
        ) : (
          <TrendLine
            labels={calLabels}
            values={calValues}
            todayIndex={trendsIdx}
            refLines={[
              ...(weeklyActiveCalGoal != null && weeklyActiveCalGoal > 0
                ? [
                    {
                      y: Math.round(weeklyActiveCalGoal / 7),
                      label: `Daily target ${Math.round(weeklyActiveCalGoal / 7).toLocaleString()}`,
                      dashed: true,
                    },
                  ]
                : calAvg != null
                  ? [
                      {
                        y: calAvg,
                        label: `avg ${Math.round(calAvg).toLocaleString()}`,
                        dashed: true,
                      },
                    ]
                  : []),
            ]}
            formatValue={(v) => `${Math.round(v).toLocaleString()} kcal`}
            ariaLabel={`Active calories ${windowLabel}`}
            endpointRight={trendsIdx >= 0 ? "Today" : calLabels[calLabels.length - 1]}
            fill
          />
        ))}
    </ChartFrame>
  );
}

// ── Sleep chart panel ────────────────────────────────────────────────────────

function SleepChartPanel({
  trends,
  windowLabel,
}: {
  trends: RecoveryMetrics[];
  windowLabel: string;
}) {
  const today = todayString();
  const hasSpo2 = trends.some((d) => d.spo2_avg != null && d.spo2_avg > 0);

  const SLEEP_TABS: { key: SleepTab; label: string }[] = [
    { key: "stages", label: "Stages" },
    { key: "hrv", label: "HRV" },
    { key: "rhr", label: "RHR" },
    ...(hasSpo2 ? [{ key: "spo2" as SleepTab, label: "SpO₂" }] : []),
  ];

  const [tab, setTab] = useState<SleepTab>("stages");
  const labels = trends.map((d) => formatDate(d.date));
  const todayIdx = trends[trends.length - 1]?.date === today ? trends.length - 1 : -1;

  const deep = trends.map((d) => d.deep_hrs);
  const rem = trends.map((d) => d.rem_hrs);
  const light = trends.map((d) => d.light_hrs);
  const hrv = trends.map((d) => d.avg_hrv);
  const rhr = trends.map((d) => d.resting_hr);
  const spo2 = trends.map((d) => d.spo2_avg);

  const stagesLatest = (() => {
    const last = trends[trends.length - 1];
    if (!last) return null;
    const d = last.deep_hrs ?? 0;
    const r = last.rem_hrs ?? 0;
    const l = last.light_hrs ?? 0;
    const t = d + r + l;
    return t > 0 ? t : null;
  })();
  const hrvLatest = hrv[hrv.length - 1] ?? null;
  const hrvAvg = trailingAvg(hrv);
  const rhrLatest = rhr[rhr.length - 1] ?? null;
  const rhrAvg = trailingAvg(rhr);
  const spo2Latest = spo2[spo2.length - 1] ?? null;
  const spo2Avg = trailingAvg(spo2);

  const label = `${
    {
      stages: "Sleep stages",
      hrv: "HRV",
      rhr: "Resting HR",
      spo2: "SpO₂",
    }[tab]
  } · ${windowLabel}`;

  const value: React.ReactNode = (() => {
    switch (tab) {
      case "stages":
        return stagesLatest != null ? fmtHrs(stagesLatest) : "—";
      case "hrv":
        return hrvLatest != null
          ? `${Math.round(hrvLatest)} ms${hrvAvg != null ? ` · avg ${Math.round(hrvAvg)}` : ""}`
          : "—";
      case "rhr":
        return rhrLatest != null
          ? `${Math.round(rhrLatest)} bpm${rhrAvg != null ? ` · avg ${Math.round(rhrAvg)}` : ""}`
          : "—";
      case "spo2":
        return spo2Latest != null
          ? `${spo2Latest.toFixed(1)}%${spo2Avg != null ? ` · avg ${spo2Avg.toFixed(1)}%` : ""}`
          : "—";
    }
  })();

  return (
    <ChartFrame
      label={label}
      value={value}
      action={<TabPills tabs={SLEEP_TABS} active={tab} onSelect={setTab} />}
    >
      {tab === "stages" &&
        (deep.every((v) => v == null) ? (
          <Empty />
        ) : (
          <StackedBars
            labels={labels}
            stacks={[
              { name: "Deep", values: deep },
              { name: "Core", values: light },
              { name: "REM", values: rem },
            ]}
            todayIndex={todayIdx}
            formatTotal={(v) => fmtHrs(v)}
            refLines={[{ y: 8, label: "8h target", dashed: true }]}
            ariaLabel={`Sleep stages ${windowLabel}`}
            endpointRight={todayIdx >= 0 ? "Today" : labels[labels.length - 1]}
          />
        ))}
      {tab === "hrv" &&
        (hrv.every((v) => v == null) ? (
          <Empty />
        ) : (
          <TrendLine
            labels={labels}
            values={hrv}
            todayIndex={todayIdx}
            refLines={
              hrvAvg != null
                ? [{ y: hrvAvg, label: `avg ${Math.round(hrvAvg)} ms`, dashed: true }]
                : []
            }
            formatValue={(v) => `${Math.round(v)} ms`}
            ariaLabel={`HRV ${windowLabel}`}
            endpointRight={todayIdx >= 0 ? "Today" : labels[labels.length - 1]}
            fill
          />
        ))}
      {tab === "rhr" &&
        (rhr.every((v) => v == null) ? (
          <Empty />
        ) : (
          <TrendLine
            labels={labels}
            values={rhr}
            todayIndex={todayIdx}
            refLines={
              rhrAvg != null
                ? [
                    {
                      y: rhrAvg,
                      label: `avg ${Math.round(rhrAvg)} bpm`,
                      dashed: true,
                    },
                  ]
                : []
            }
            formatValue={(v) => `${Math.round(v)} bpm`}
            ariaLabel={`Resting HR ${windowLabel}`}
            endpointRight={todayIdx >= 0 ? "Today" : labels[labels.length - 1]}
          />
        ))}
      {tab === "spo2" &&
        (spo2.every((v) => v == null) ? (
          <Empty />
        ) : (
          <TrendLine
            labels={labels}
            values={spo2}
            todayIndex={todayIdx}
            formatValue={(v) => `${v.toFixed(1)}%`}
            ariaLabel={`SpO₂ ${windowLabel}`}
            endpointRight={todayIdx >= 0 ? "Today" : labels[labels.length - 1]}
          />
        ))}
    </ChartFrame>
  );
}

function Empty() {
  return (
    <div
      className="flex items-center"
      style={{
        height: 120,
        fontSize: "var(--t-micro)",
        color: "var(--color-text-faint)",
        fontStyle: "italic",
      }}
    >
      No data for this period
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function HealthBreakdown({
  recovery,
  trends,
  fitnessData,
  windowLabel,
  weightGoal,
  bodyFatGoal,
  weeklyActiveCalGoal,
}: Props) {
  return (
    <section className="flex flex-col" style={{ gap: "var(--space-6)" }}>
      <h2 className="db-section-label">Health breakdown</h2>

      {recovery ? (
        <>
          <div
            className="flex flex-wrap items-baseline"
            style={{
              gap: "var(--space-6)",
              paddingBottom: "var(--space-4)",
              borderBottom: "1px solid var(--rule-soft)",
            }}
          >
            <ScoreSlot label="Readiness" score={recovery.readiness} large />
            <ScoreSlot label="Sleep" score={recovery.sleep_score} />
            {recovery.activity_score != null && (
              <ScoreSlot label="Activity" score={recovery.activity_score} />
            )}
            <div className="ml-auto" style={{ minWidth: 0 }}>
              <p
                style={{
                  fontSize: "var(--t-micro)",
                  color:
                    recovery.readiness != null && recovery.readiness < 55
                      ? "var(--accent)"
                      : "var(--color-text-muted)",
                  margin: 0,
                }}
              >
                {scoreText(recovery.readiness)}
              </p>
              <p
                className="tnum"
                style={{
                  fontSize: 11,
                  color: "var(--color-text-faint)",
                  marginTop: 2,
                  marginBottom: 0,
                }}
              >
                {recovery.source ?? "Oura"} · {recovery.date}
              </p>
            </div>
          </div>

          {/* Metrics grid */}
          <div
            className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6"
            style={{ gap: "var(--space-5) var(--space-5)" }}
          >
            <Metric label="HRV" value={fmtNum(recovery.avg_hrv)} unit="ms" />
            <Metric label="RHR" value={fmtNum(recovery.resting_hr)} unit="bpm" />
            <Metric label="Total" value={fmtHrs(recovery.total_sleep_hrs)} />
            <Metric label="Deep" value={fmtHrs(recovery.deep_hrs)} />
            <Metric label="REM" value={fmtHrs(recovery.rem_hrs)} />
            <Metric
              label="Steps"
              value={recovery.steps != null ? recovery.steps.toLocaleString() : "—"}
            />
          </div>

          {/* Stress row */}
          {(metaVal(recovery, "stress_high_mins") != null ||
            metaVal(recovery, "stress_day_summary") != null) && (
            <div
              className="flex flex-wrap items-center tnum"
              style={{
                gap: "var(--space-3) var(--space-4)",
                paddingTop: "var(--space-3)",
                borderTop: "1px solid var(--rule-soft)",
                fontSize: "var(--t-micro)",
                color: "var(--color-text-muted)",
              }}
            >
              <span
                style={{
                  textTransform: "uppercase",
                  letterSpacing: "0.12em",
                  color: "var(--color-text-muted)",
                  fontWeight: 500,
                }}
              >
                Stress
              </span>
              {metaVal(recovery, "stress_high_mins") != null && (
                <span style={{ color: "var(--color-text)" }}>
                  {metaVal(recovery, "stress_high_mins")}m high
                  {metaVal(recovery, "stress_recovery_mins") != null && (
                    <> · {metaVal(recovery, "stress_recovery_mins")}m recovery</>
                  )}
                </span>
              )}
              {metaVal(recovery, "stress_day_summary") != null && (
                <span style={{ textTransform: "capitalize" }}>
                  {String(metaVal(recovery, "stress_day_summary")).replace(/_/g, " ")}
                </span>
              )}
              {metaVal(recovery, "resilience_level") != null && (
                <span className="ml-auto" style={{ textTransform: "capitalize" }}>
                  Resilience: {String(metaVal(recovery, "resilience_level")).replace(/_/g, " ")}
                </span>
              )}
            </div>
          )}

          {/* Two chart panels */}
          <div
            className="grid grid-cols-1 lg:grid-cols-2"
            style={{
              gap: "var(--space-7)",
              paddingTop: "var(--space-5)",
              borderTop: "1px solid var(--rule-soft)",
            }}
          >
            <FitnessChartPanel
              fitnessData={fitnessData}
              trends={trends}
              windowLabel={windowLabel}
              weightGoal={weightGoal}
              bodyFatGoal={bodyFatGoal}
              weeklyActiveCalGoal={weeklyActiveCalGoal}
            />
            <SleepChartPanel trends={trends} windowLabel={windowLabel} />
          </div>
        </>
      ) : (
        <div
          className="flex items-center justify-center"
          style={{
            padding: "var(--space-7) 0",
            borderTop: "1px solid var(--rule-soft)",
            borderBottom: "1px solid var(--rule-soft)",
          }}
        >
          <p
            style={{
              fontSize: "var(--t-micro)",
              color: "var(--color-text-faint)",
            }}
          >
            No recovery data — run a sync to pull latest from Oura
          </p>
        </div>
      )}
    </section>
  );
}

function ScoreSlot({
  label,
  score,
  large,
}: {
  label: string;
  score: number | null;
  large?: boolean;
}) {
  const accent = score != null && score < 55;
  const color =
    score == null ? "var(--color-text-faint)" : accent ? "var(--accent)" : "var(--color-text)";
  return (
    <div className="flex flex-col" style={{ gap: "var(--space-1)" }}>
      <span
        style={{
          fontSize: "var(--t-micro)",
          color: "var(--color-text-faint)",
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          fontWeight: 500,
        }}
      >
        {label}
      </span>
      <span
        className="tnum"
        style={{
          fontFamily: "var(--font-display), system-ui, sans-serif",
          fontSize: large ? "var(--t-display)" : "clamp(2rem, 2vw + 1rem, 2.5rem)",
          fontWeight: 400,
          color,
          letterSpacing: "-0.02em",
          lineHeight: 0.95,
        }}
      >
        {score ?? "—"}
      </span>
    </div>
  );
}
