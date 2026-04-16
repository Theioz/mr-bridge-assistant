"use client";

import type { RecoveryMetrics } from "@/lib/types";
import { formatDate } from "@/lib/chart-utils";
import { addDays, todayString } from "@/lib/timezone";
import {
  BarSeries,
  ChartFrame,
  StackedBars,
  TrendLine,
} from "@/components/charts/primitives";

interface Props {
  /** Rows ordered ascending by date, windowed to ≥ 30 days back. */
  trends: RecoveryMetrics[];
}

function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function hoursToHm(h: number): string {
  const hi = Math.floor(h);
  const m = Math.round((h - hi) * 60);
  return m > 0 ? `${hi}h ${m}m` : `${hi}h`;
}

function numberFromMeta(
  meta: Record<string, unknown> | null,
  key: string
): number | null {
  if (!meta) return null;
  const v = meta[key];
  if (typeof v === "number" && !Number.isNaN(v)) return v;
  if (typeof v === "string") {
    const parsed = parseFloat(v);
    if (!Number.isNaN(parsed)) return parsed;
  }
  return null;
}

function sliceByDate<T extends { date: string }>(
  rows: T[],
  days: number
): T[] {
  const today = todayString();
  const cutoff = addDays(today, -(days - 1));
  return rows.filter((r) => r.date >= cutoff);
}

export function RecoveryTrends({ trends }: Props) {
  const today = todayString();

  // ── Windows ───────────────────────────────────────────────────────────
  const t30 = sliceByDate(trends, 30);
  const t14 = sliceByDate(trends, 14);
  const t7 = sliceByDate(trends, 7);

  // ── HRV 30d ───────────────────────────────────────────────────────────
  const hrvValues = t30.map((r) => r.avg_hrv);
  const hrvLabels = t30.map((r) => formatDate(r.date));
  const hrvTodayIdx = t30[t30.length - 1]?.date === today ? t30.length - 1 : -1;
  const hrvLatest = t30[t30.length - 1]?.avg_hrv ?? null;
  const hrvAvg = mean(hrvValues.filter((v): v is number => v != null));

  // ── RHR 30d ───────────────────────────────────────────────────────────
  const rhrValues = t30.map((r) => r.resting_hr);
  const rhrLabels = t30.map((r) => formatDate(r.date));
  const rhrTodayIdx = t30[t30.length - 1]?.date === today ? t30.length - 1 : -1;
  const rhrLatest = t30[t30.length - 1]?.resting_hr ?? null;
  const rhrAvg = mean(rhrValues.filter((v): v is number => v != null));

  // ── Sleep stages 7d ───────────────────────────────────────────────────
  const sleepStagesLabels = t7.map((r) => formatDate(r.date));
  const deepValues = t7.map((r) => r.deep_hrs);
  const remValues = t7.map((r) => r.rem_hrs);
  const lightValues = t7.map((r) => r.light_hrs);
  const stageTodayIdx = t7[t7.length - 1]?.date === today ? t7.length - 1 : -1;
  const stagesLatestTotal = (() => {
    const last = t7[t7.length - 1];
    if (!last) return null;
    const d = last.deep_hrs ?? 0;
    const r = last.rem_hrs ?? 0;
    const l = last.light_hrs ?? 0;
    const t = d + r + l;
    return t > 0 ? t : null;
  })();

  // ── Sleep total 14d ───────────────────────────────────────────────────
  const sleepTotalLabels = t14.map((r) => formatDate(r.date));
  const sleepTotalValues = t14.map((r) => r.total_sleep_hrs);
  const sleepTotalTodayIdx =
    t14[t14.length - 1]?.date === today ? t14.length - 1 : -1;
  const sleepTotalLatest = t14[t14.length - 1]?.total_sleep_hrs ?? null;

  // ── Sleep efficiency 14d (derived from metadata or fallback) ──────────
  const sleepEffLabels = t14.map((r) => formatDate(r.date));
  const sleepEffValues = t14.map((r) => {
    // Oura stores as metadata.sleep_efficiency; value is 0-100 percent.
    const metaVal = numberFromMeta(r.metadata, "sleep_efficiency");
    return metaVal;
  });
  const sleepEffHasAny = sleepEffValues.some((v) => v != null);
  const sleepEffTodayIdx =
    t14[t14.length - 1]?.date === today ? t14.length - 1 : -1;
  const sleepEffLatest = sleepEffValues[sleepEffValues.length - 1] ?? null;
  const sleepEffAvg = mean(
    sleepEffValues.filter((v): v is number => v != null)
  );

  return (
    <section
      className="flex flex-col"
      style={{ gap: "var(--space-7)", minWidth: 0 }}
    >
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
        Recovery
      </h2>

      {/* Sleep row: stages / total / efficiency */}
      <div
        className="grid grid-cols-1 lg:grid-cols-3"
        style={{ gap: "var(--space-7)" }}
      >
        <ChartFrame
          label="Sleep stages · 7D"
          value={
            stagesLatestTotal != null
              ? `last ${hoursToHm(stagesLatestTotal)}`
              : "—"
          }
          note={
            <span style={{ color: "var(--color-text-faint)" }}>
              <Swatch opacity={0.85} /> Deep ·{" "}
              <Swatch opacity={0.45} /> Core ·{" "}
              <Swatch opacity={0.18} /> REM
            </span>
          }
        >
          {sleepStagesLabels.length === 0 ? (
            <EmptyRow />
          ) : (
            <StackedBars
              labels={sleepStagesLabels}
              stacks={[
                { name: "Deep", values: deepValues },
                { name: "Core", values: lightValues },
                { name: "REM", values: remValues },
              ]}
              todayIndex={stageTodayIdx}
              formatTotal={(v) => hoursToHm(v)}
              refLines={[{ y: 8, label: "8h target", dashed: true }]}
              ariaLabel="Sleep stages — last 7 days"
              endpointRight={stageTodayIdx >= 0 ? "Today" : sleepStagesLabels[sleepStagesLabels.length - 1]}
            />
          )}
        </ChartFrame>

        <ChartFrame
          label="Sleep total · 14D"
          value={sleepTotalLatest != null ? `last ${hoursToHm(sleepTotalLatest)}` : "—"}
        >
          {sleepTotalValues.every((v) => v == null) ? (
            <EmptyRow />
          ) : (
            <BarSeries
              labels={sleepTotalLabels}
              values={sleepTotalValues}
              todayIndex={sleepTotalTodayIdx}
              refLines={[{ y: 8, label: "8h", dashed: true }]}
              formatValue={(v) => hoursToHm(v)}
              ariaLabel="Sleep total — last 14 days"
              opacity={() => 0.5}
              endpointRight={sleepTotalTodayIdx >= 0 ? "Today" : sleepTotalLabels[sleepTotalLabels.length - 1]}
            />
          )}
        </ChartFrame>

        <ChartFrame
          label="Sleep efficiency · 14D"
          value={
            sleepEffLatest != null
              ? `${sleepEffLatest.toFixed(0)}%${
                  sleepEffAvg != null ? ` · avg ${sleepEffAvg.toFixed(0)}%` : ""
                }`
              : "—"
          }
        >
          {!sleepEffHasAny ? (
            <EmptyRow
              message={
                <>
                  No efficiency data —{" "}
                  <code
                    style={{
                      fontSize: 11,
                      color: "var(--color-text-muted)",
                    }}
                  >
                    sleep_efficiency
                  </code>{" "}
                  is populated from Oura metadata.
                </>
              }
            />
          ) : (
            <TrendLine
              labels={sleepEffLabels}
              values={sleepEffValues}
              todayIndex={sleepEffTodayIdx}
              refLines={
                sleepEffAvg != null
                  ? [
                      {
                        y: sleepEffAvg,
                        label: `avg ${sleepEffAvg.toFixed(0)}%`,
                        dashed: true,
                      },
                    ]
                  : []
              }
              formatValue={(v) => `${v.toFixed(0)}%`}
              ariaLabel="Sleep efficiency — last 14 days"
              endpointRight={sleepEffTodayIdx >= 0 ? "Today" : sleepEffLabels[sleepEffLabels.length - 1]}
              yDomain={[
                Math.max(0, Math.min(...sleepEffValues.filter((v): v is number => v != null)) - 5),
                100,
              ]}
            />
          )}
        </ChartFrame>
      </div>

      {/* HRV + RHR row */}
      <div
        className="grid grid-cols-1 lg:grid-cols-2"
        style={{ gap: "var(--space-7)" }}
      >
        <ChartFrame
          label="HRV · 30D"
          value={
            hrvLatest != null
              ? `${Math.round(hrvLatest)} ms${
                  hrvAvg != null ? ` · avg ${Math.round(hrvAvg)} ms` : ""
                }`
              : "—"
          }
        >
          {hrvValues.every((v) => v == null) ? (
            <EmptyRow />
          ) : (
            <TrendLine
              labels={hrvLabels}
              values={hrvValues}
              todayIndex={hrvTodayIdx}
              refLines={
                hrvAvg != null
                  ? [
                      {
                        y: hrvAvg,
                        label: `avg ${Math.round(hrvAvg)} ms`,
                        dashed: true,
                      },
                    ]
                  : []
              }
              formatValue={(v) => `${Math.round(v)} ms`}
              ariaLabel="HRV — last 30 days"
              endpointRight={hrvTodayIdx >= 0 ? "Today" : hrvLabels[hrvLabels.length - 1]}
              fill
            />
          )}
        </ChartFrame>

        <ChartFrame
          label="Resting HR · 30D"
          value={
            rhrLatest != null
              ? `${Math.round(rhrLatest)} bpm${
                  rhrAvg != null ? ` · avg ${Math.round(rhrAvg)} bpm` : ""
                }`
              : "—"
          }
        >
          {rhrValues.every((v) => v == null) ? (
            <EmptyRow />
          ) : (
            <TrendLine
              labels={rhrLabels}
              values={rhrValues}
              todayIndex={rhrTodayIdx}
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
              ariaLabel="Resting heart rate — last 30 days"
              endpointRight={rhrTodayIdx >= 0 ? "Today" : rhrLabels[rhrLabels.length - 1]}
            />
          )}
        </ChartFrame>
      </div>
    </section>
  );
}

function Swatch({ opacity }: { opacity: number }) {
  return (
    <span
      style={{
        display: "inline-block",
        width: 8,
        height: 8,
        verticalAlign: "baseline",
        marginRight: 3,
        background: "var(--chart-color-primary)",
        opacity,
      }}
    />
  );
}

function EmptyRow({
  message = "No data for this period",
}: {
  message?: React.ReactNode;
}) {
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
      {message}
    </div>
  );
}
