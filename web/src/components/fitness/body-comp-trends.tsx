"use client";

import Link from "next/link";
import type { FitnessLog } from "@/lib/types";
import type { WindowKey } from "@/lib/window";
import { formatDate } from "@/lib/chart-utils";
import { todayString } from "@/lib/timezone";
import { ChartFrame, TrendLine } from "@/components/charts/primitives";

interface Props {
  data: FitnessLog[];
  windowKey: WindowKey;
  weightGoal: number | null;
  bodyFatGoal: number | null;
}

export function BodyCompTrends({
  data,
  windowKey,
  weightGoal,
  bodyFatGoal,
}: Props) {
  const today = todayString();

  const weightPoints = data
    .filter((d) => d.weight_lb != null)
    .map((d) => ({ date: d.date, value: d.weight_lb as number }));
  const bfPoints = data
    .filter((d) => d.body_fat_pct != null)
    .map((d) => ({ date: d.date, value: d.body_fat_pct as number }));

  const weightLabels = weightPoints.map((p) => formatDate(p.date));
  const bfLabels = bfPoints.map((p) => formatDate(p.date));
  const weightValues = weightPoints.map((p) => p.value);
  const bfValues = bfPoints.map((p) => p.value);

  const weightLatest = weightPoints[weightPoints.length - 1] ?? null;
  const bfLatest = bfPoints[bfPoints.length - 1] ?? null;

  const weightTodayIndex =
    weightLatest?.date === today ? weightValues.length - 1 : -1;
  const bfTodayIndex = bfLatest?.date === today ? bfValues.length - 1 : -1;

  const windowLabel = windowKey.toUpperCase();

  function weightMeta(): string {
    if (!weightLatest) return "—";
    const parts = [`${weightLatest.value.toFixed(1)} lb`];
    if (weightGoal != null && weightGoal > 0) {
      const diff = weightLatest.value - weightGoal;
      parts.push(
        diff > 0
          ? `+${diff.toFixed(1)} vs goal`
          : diff < -0.05
          ? `${diff.toFixed(1)} vs goal`
          : "at goal"
      );
    }
    return parts.join(" · ");
  }

  function bfMeta(): string {
    if (!bfLatest) return "—";
    const parts = [`${bfLatest.value.toFixed(1)}%`];
    if (bodyFatGoal != null && bodyFatGoal > 0) {
      const diff = bfLatest.value - bodyFatGoal;
      parts.push(
        diff > 0
          ? `+${diff.toFixed(1)} vs goal`
          : diff < -0.05
          ? `${diff.toFixed(1)} vs goal`
          : "at goal"
      );
    }
    return parts.join(" · ");
  }

  const weightRef = weightGoal != null && weightGoal > 0
    ? [{ y: weightGoal, label: `Goal ${weightGoal} lb`, dashed: true }]
    : [];
  const bfRef = bodyFatGoal != null && bodyFatGoal > 0
    ? [{ y: bodyFatGoal, label: `Goal ${bodyFatGoal}%`, dashed: true }]
    : [];

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
          Body composition
        </h2>
        <span
          style={{
            fontFamily: "var(--font-display), system-ui, sans-serif",
            fontSize: "var(--t-micro)",
            letterSpacing: "0.04em",
            color: "var(--color-text-faint)",
            textTransform: "uppercase",
          }}
        >
          {windowLabel}
        </span>
      </div>

      <div
        className="grid grid-cols-1 lg:grid-cols-2"
        style={{ gap: "var(--space-7)" }}
      >
        <ChartFrame
          label={`Weight · ${windowLabel}`}
          value={weightMeta()}
          note={weightGoal == null ? <LinkToSettings /> : undefined}
        >
          {weightValues.length === 0 ? (
            <EmptyRow />
          ) : (
            <TrendLine
              labels={weightLabels}
              values={weightValues}
              todayIndex={weightTodayIndex}
              refLines={weightRef}
              formatValue={(v) => `${v.toFixed(1)} lb`}
              ariaLabel={`Weight ${windowLabel}`}
              endpointRight={
                weightTodayIndex >= 0
                  ? "Today"
                  : weightLabels[weightLabels.length - 1]
              }
            />
          )}
        </ChartFrame>

        <ChartFrame
          label={`Body fat · ${windowLabel}`}
          value={bfMeta()}
          note={bodyFatGoal == null ? <LinkToSettings /> : undefined}
        >
          {bfValues.length === 0 ? (
            <EmptyRow />
          ) : (
            <TrendLine
              labels={bfLabels}
              values={bfValues}
              todayIndex={bfTodayIndex}
              refLines={bfRef}
              formatValue={(v) => `${v.toFixed(1)}%`}
              ariaLabel={`Body fat ${windowLabel}`}
              endpointRight={
                bfTodayIndex >= 0 ? "Today" : bfLabels[bfLabels.length - 1]
              }
            />
          )}
        </ChartFrame>
      </div>
    </section>
  );
}

function EmptyRow() {
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
