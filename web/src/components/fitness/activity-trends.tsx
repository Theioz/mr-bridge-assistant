"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { WorkoutSession, RecoveryMetrics } from "@/lib/types";
import { addDays, todayString } from "@/lib/timezone";
import { formatDate } from "@/lib/chart-utils";
import { BarSeries, ChartFrame, TrendLine } from "@/components/charts/primitives";

type Granularity = "daily" | "weekly";

interface Props {
  sessions: WorkoutSession[];
  recovery: Pick<RecoveryMetrics, "date" | "active_cal">[];
  days: number;
  weeklyWorkoutGoal: number | null;
  weeklyActiveCalGoal: number | null;
  walkCount: number;
  walkDuration: number;
}

function getISOWeekKey(dateStr: string): string {
  const day = new Date(`${dateStr}T12:00:00Z`).getUTCDay();
  const diff = (day === 0 ? -6 : 1) - day;
  return addDays(dateStr, diff);
}

function getISOWeekLabel(dateStr: string): string {
  const monday = getISOWeekKey(dateStr);
  return new Date(`${monday}T12:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

export function ActivityTrends({
  sessions,
  recovery,
  days,
  weeklyWorkoutGoal,
  weeklyActiveCalGoal,
  walkCount,
  walkDuration,
}: Props) {
  const weekCount = Math.ceil(days / 7);
  const forceWeekly = days > 90;
  const [granularity, setGranularity] = useState<Granularity>(
    forceWeekly ? "weekly" : "daily"
  );
  useEffect(() => {
    if (forceWeekly) setGranularity("weekly");
  }, [forceWeekly]);

  const today = todayString();

  // ── Workout frequency ─────────────────────────────────────────────────
  const freqLabels: string[] = [];
  const freqValues: (number | null)[] = [];
  if (granularity === "weekly") {
    const weeks: { key: string; label: string; count: number }[] = [];
    for (let i = weekCount - 1; i >= 0; i--) {
      const dateStr = addDays(today, -i * 7);
      const key = getISOWeekKey(dateStr);
      if (!weeks.find((w) => w.key === key)) {
        weeks.push({ key, label: getISOWeekLabel(dateStr), count: 0 });
      }
    }
    sessions.forEach((s) => {
      const key = getISOWeekKey(s.date);
      const slot = weeks.find((w) => w.key === key);
      if (slot) slot.count++;
    });
    weeks.forEach((w) => {
      freqLabels.push(w.label);
      freqValues.push(w.count);
    });
  } else {
    const sessionSet = new Set(sessions.map((s) => s.date));
    for (let i = days - 1; i >= 0; i--) {
      const dateStr = addDays(today, -i);
      freqLabels.push(formatDate(dateStr));
      freqValues.push(sessionSet.has(dateStr) ? 1 : 0);
    }
  }

  const freqTodayIndex = freqLabels.length - 1;
  const freqRefLines =
    weeklyWorkoutGoal != null && granularity === "weekly"
      ? [{ y: weeklyWorkoutGoal, label: `Goal ${weeklyWorkoutGoal}`, dashed: true }]
      : [];

  // ── Active calories ────────────────────────────────────────────────────
  const calLabels: string[] = [];
  const calValues: (number | null)[] = [];
  if (granularity === "weekly") {
    const weeks: { key: string; label: string; total: number }[] = [];
    for (let i = weekCount - 1; i >= 0; i--) {
      const dateStr = addDays(today, -i * 7);
      const key = getISOWeekKey(dateStr);
      if (!weeks.find((w) => w.key === key)) {
        weeks.push({ key, label: getISOWeekLabel(dateStr), total: 0 });
      }
    }
    recovery.forEach((d) => {
      if (d.active_cal == null) return;
      const key = getISOWeekKey(d.date);
      const slot = weeks.find((w) => w.key === key);
      if (slot) slot.total += d.active_cal;
    });
    weeks.forEach((w) => {
      calLabels.push(w.label);
      calValues.push(w.total || null);
    });
  } else {
    const calMap = new Map(
      recovery
        .filter((d) => d.active_cal != null)
        .map((d) => [d.date, d.active_cal!])
    );
    for (let i = days - 1; i >= 0; i--) {
      const dateStr = addDays(today, -i);
      calLabels.push(formatDate(dateStr));
      const v = calMap.get(dateStr);
      calValues.push(v ?? null);
    }
  }

  const calTodayIndex = calLabels.length - 1;
  const dailyCalGoal =
    weeklyActiveCalGoal != null ? Math.round(weeklyActiveCalGoal / 7) : null;
  const calRefLines: { y: number; label?: string; dashed?: boolean }[] = [];
  if (granularity === "weekly" && weeklyActiveCalGoal != null) {
    calRefLines.push({ y: weeklyActiveCalGoal, label: `Goal ${weeklyActiveCalGoal.toLocaleString()}`, dashed: true });
  }
  if (granularity === "daily" && dailyCalGoal != null) {
    calRefLines.push({ y: dailyCalGoal, label: `Daily target ${dailyCalGoal.toLocaleString()}`, dashed: true });
  }

  // ── Meta readouts ──────────────────────────────────────────────────────
  const latestFreq = freqValues[freqTodayIndex] ?? null;
  const latestCal = calValues[calTodayIndex] ?? null;
  const freqMeta =
    granularity === "weekly"
      ? `this week ${latestFreq ?? 0}`
      : latestFreq === 1
      ? "trained today"
      : "rest day";
  const calMeta = (() => {
    if (latestCal == null) return "—";
    const rounded = Math.round(latestCal).toLocaleString();
    return granularity === "weekly" ? `this week ${rounded} kcal` : `today ${rounded} kcal`;
  })();

  // ── Granularity pills ──────────────────────────────────────────────────
  const GranToggle = (
    <div
      className="flex items-center gap-0.5 p-0.5"
      style={{
        border: "1px solid var(--rule)",
        borderRadius: "var(--r-1)",
        opacity: forceWeekly ? 0.55 : 1,
      }}
    >
      {(["daily", "weekly"] as const).map((opt) => {
        const active = opt === granularity;
        return (
          <button
            key={opt}
            onClick={() => !forceWeekly && setGranularity(opt)}
            disabled={forceWeekly}
            className="text-xs font-medium flex items-center justify-center cursor-pointer"
            style={{
              background: active ? "var(--accent)" : "transparent",
              color: active ? "var(--color-text-on-cta)" : "var(--color-text-muted)",
              borderRadius: "var(--r-1)",
              minHeight: 32,
              padding: "0 var(--space-3)",
              transition: "background var(--motion-fast) var(--ease-out-quart), color var(--motion-fast) var(--ease-out-quart)",
            }}
            title={forceWeekly ? "Switch to a shorter window to view daily data" : undefined}
          >
            {opt === "daily" ? "Daily" : "Weekly"}
          </button>
        );
      })}
    </div>
  );

  const freqEmpty = freqValues.every((v) => v == null || v === 0);
  const freqFormat = (v: number) =>
    granularity === "weekly"
      ? `${v} session${v === 1 ? "" : "s"}`
      : v > 0
      ? "trained"
      : "rest";

  const calLineValues = calValues;

  return (
    <section
      className="flex flex-col"
      style={{ gap: "var(--space-6)", minWidth: 0 }}
    >
      <div className="flex items-baseline justify-between gap-3 flex-wrap">
        <h2
          style={{
            margin: 0,
            fontFamily: "var(--font-display), system-ui, sans-serif",
            fontSize: "var(--t-h2)",
            fontWeight: 600,
            color: "var(--color-text)",
            letterSpacing: "-0.01em",
          }}
        >
          Activity
        </h2>
        {GranToggle}
      </div>

      <div
        className="grid grid-cols-1 lg:grid-cols-2"
        style={{ gap: "var(--space-7)" }}
      >
        <ChartFrame
          label={granularity === "weekly" ? "Workout frequency · weekly" : "Workout frequency · daily"}
          value={freqMeta}
          note={
            weeklyWorkoutGoal == null ? (
              <LinkToSettings />
            ) : undefined
          }
        >
          <BarSeries
            labels={freqLabels}
            values={freqValues}
            todayIndex={freqTodayIndex}
            refLines={freqRefLines}
            formatValue={freqFormat}
            ariaLabel={`Workout frequency, ${granularity}`}
            opacity={(_, v) =>
              v == null || v === 0
                ? 0
                : weeklyWorkoutGoal != null &&
                  granularity === "weekly" &&
                  v >= weeklyWorkoutGoal
                ? 0.85
                : 0.5
            }
            endpointRight="Today"
          />
          {freqEmpty && granularity === "daily" && (
            <p
              style={{
                fontSize: "var(--t-micro)",
                color: "var(--color-text-faint)",
                fontStyle: "italic",
                marginTop: 4,
              }}
            >
              No workouts logged in this window.
            </p>
          )}
          {walkCount > 0 && (
            <div
              className="flex items-center tnum"
              style={{
                paddingTop: "var(--space-3)",
                borderTop: "1px solid var(--rule-soft)",
                gap: "var(--space-3)",
                fontSize: "var(--t-micro)",
                color: "var(--color-text-muted)",
              }}
            >
              <span
                style={{
                  textTransform: "uppercase",
                  letterSpacing: "0.12em",
                  fontWeight: 500,
                  color: "var(--color-text-faint)",
                }}
              >
                Walks this week
              </span>
              <span style={{ color: "var(--color-text)" }}>{walkCount}</span>
              {walkDuration > 0 && (
                <span>
                  {walkDuration >= 60
                    ? `${Math.floor(walkDuration / 60)}h ${walkDuration % 60}m`
                    : `${walkDuration}m`}
                </span>
              )}
            </div>
          )}
        </ChartFrame>

        <ChartFrame
          label={granularity === "weekly" ? "Active calories · weekly" : "Active calories · daily"}
          value={calMeta}
          note={
            weeklyActiveCalGoal == null ? <LinkToSettings /> : undefined
          }
        >
          {granularity === "daily" ? (
            <TrendLine
              labels={calLabels}
              values={calLineValues}
              todayIndex={calTodayIndex}
              refLines={calRefLines}
              formatValue={(v) => `${Math.round(v).toLocaleString()} kcal`}
              ariaLabel="Active calories, daily"
              endpointRight="Today"
              fill
            />
          ) : (
            <BarSeries
              labels={calLabels}
              values={calValues}
              todayIndex={calTodayIndex}
              refLines={calRefLines}
              formatValue={(v) => `${Math.round(v).toLocaleString()} kcal`}
              ariaLabel="Active calories, weekly"
              endpointRight="Today"
              opacity={(_, v) =>
                v == null
                  ? 0
                  : weeklyActiveCalGoal != null && v >= weeklyActiveCalGoal
                  ? 0.85
                  : 0.5
              }
            />
          )}
        </ChartFrame>
      </div>
    </section>
  );
}

function LinkToSettings() {
  return (
    <span>
      <Link
        href="/settings"
        style={{
          color: "var(--color-text-muted)",
          textDecoration: "none",
          borderBottom: "1px solid var(--rule)",
          paddingBottom: 1,
        }}
      >
        Set your goals in Settings
      </Link>{" "}
      to see goal tracking.
    </span>
  );
}
