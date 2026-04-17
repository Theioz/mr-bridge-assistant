import { Sparkline } from "@/components/charts/sparkline";
import type { FitnessLog, RecoveryMetrics } from "@/lib/types";
import { todayString, addDays } from "@/lib/timezone";

type Props = {
  fitnessData: Pick<FitnessLog, "date" | "weight_lb" | "body_fat_pct">[];
  trends: RecoveryMetrics[];
};

type Direction = "up" | "down" | "flat";

function avg(values: Array<number | null | undefined>): number | null {
  const nums = values.filter((v): v is number => typeof v === "number" && !Number.isNaN(v));
  if (nums.length === 0) return null;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function last7<T extends { date: string }>(rows: T[]): T[] {
  return rows.slice(-7);
}

/**
 * Returns the most recent non-null value + its date from a date-sorted array,
 * or null if none. Used so the "latest" reading on each cell carries its own
 * date and the label ("today" / "yesterday" / "Apr 15") is time-aware rather
 * than hardcoded.
 */
function lastNonNull<T extends { date: string }>(
  rows: T[],
  key: keyof T
): { value: number; date: string } | null {
  for (let i = rows.length - 1; i >= 0; i--) {
    const v = rows[i][key];
    if (typeof v === "number" && !Number.isNaN(v)) {
      return { value: v, date: rows[i].date };
    }
  }
  return null;
}

function deltaClass(direction: Direction, higherIsBetter: boolean): string {
  if (direction === "flat") return "delta-flat";
  const good = higherIsBetter ? direction === "up" : direction === "down";
  return good ? "delta-good" : "delta-bad";
}

function arrow(direction: Direction): string {
  return direction === "up" ? "↑" : direction === "down" ? "↓" : "→";
}

function direction(latest: number, reference: number): Direction {
  const diff = latest - reference;
  if (Math.abs(diff) < 0.0001) return "flat";
  return diff > 0 ? "up" : "down";
}

function formatNumber(n: number, digits = 1): string {
  if (Math.abs(n) >= 1000) {
    return n.toLocaleString("en-US", { maximumFractionDigits: 0 });
  }
  return n.toFixed(digits);
}

/**
 * Label the latest reading by how recent it is. "today" / "yesterday" are
 * literal copy; older dates fall back to a short "Apr 15" style so stale
 * samples aren't misrepresented as recent.
 */
function latestLabel(latestDate: string | null, today: string): string {
  if (!latestDate) return "";
  if (latestDate === today) return "today";
  if (latestDate === addDays(today, -1)) return "yesterday";
  return new Date(latestDate + "T12:00:00Z").toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

type CellProps = {
  label: string;
  unit?: string;
  avgValue: number | null;
  latestValue: number | null;
  latestDate: string | null;
  series: number[];
  higherIsBetter: boolean;
  digits?: number;
  ariaLabel: string;
  today: string;
};

function SummaryCell({
  label,
  unit,
  avgValue,
  latestValue,
  latestDate,
  series,
  higherIsBetter,
  digits = 1,
  ariaLabel,
  today,
}: CellProps) {
  const showDelta = avgValue !== null && latestValue !== null;
  const delta = showDelta ? latestValue - avgValue : 0;
  const dir = showDelta ? direction(latestValue, avgValue) : "flat";
  const deltaDigits = Math.abs(delta) >= 1000 ? 0 : digits;
  const deltaText = showDelta
    ? `${arrow(dir)}${formatNumber(Math.abs(delta), deltaDigits)}`
    : "—";
  const latestLabelText = latestLabel(latestDate, today);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "var(--space-2)",
        minWidth: 0,
      }}
    >
      <span
        style={{
          fontFamily: "var(--font-display), system-ui, sans-serif",
          fontSize: "var(--t-micro)",
          fontWeight: 600,
          textTransform: "uppercase",
          letterSpacing: "0.12em",
          color: "var(--color-text-faint)",
        }}
      >
        {label}
      </span>
      <span
        className="tnum"
        style={{
          fontFamily: "var(--font-display), system-ui, sans-serif",
          fontSize: "1.625rem",
          fontWeight: 400,
          letterSpacing: "-0.02em",
          color: "var(--color-text)",
          lineHeight: 1,
          display: "flex",
          alignItems: "baseline",
          gap: "4px",
          flexWrap: "wrap",
        }}
      >
        {avgValue !== null ? formatNumber(avgValue, digits) : "—"}
        {unit && (
          <span
            style={{
              fontSize: "0.55em",
              color: "var(--color-text-faint)",
              fontWeight: 500,
              textTransform: "uppercase",
              letterSpacing: "0.06em",
            }}
          >
            {unit}
          </span>
        )}
      </span>
      <span
        className="tnum"
        style={{
          fontSize: "var(--t-micro)",
          color: "var(--color-text-muted)",
          display: "flex",
          gap: "var(--space-2)",
          alignItems: "baseline",
          flexWrap: "wrap",
        }}
      >
        <span>
          <span style={{ color: "var(--color-text-faint)" }}>
            {latestLabelText || "latest"}
          </span>{" "}
          {latestValue !== null ? formatNumber(latestValue, digits) : "—"}
        </span>
        {showDelta && (
          <span className={deltaClass(dir, higherIsBetter)}>{deltaText}</span>
        )}
      </span>
      {series.length > 0 && <Sparkline values={series} ariaLabel={ariaLabel} />}
    </div>
  );
}

export default function BodyFitnessSummary({ fitnessData, trends }: Props) {
  const today = todayString();
  const fitness7 = last7(fitnessData);
  const recovery7 = last7(trends);

  const weightSeries = fitness7
    .map((r) => r.weight_lb)
    .filter((v): v is number => typeof v === "number");
  const bodyFatSeries = fitness7
    .map((r) => r.body_fat_pct)
    .filter((v): v is number => typeof v === "number");
  const stepsSeries = recovery7
    .map((r) => r.steps)
    .filter((v): v is number => typeof v === "number");
  const activeCalSeries = recovery7
    .map((r) => r.active_cal)
    .filter((v): v is number => typeof v === "number");

  const weightAvg = avg(weightSeries);
  const bodyFatAvg = avg(bodyFatSeries);
  const stepsAvg = avg(stepsSeries);
  const activeCalAvg = avg(activeCalSeries);

  const weightLatest = lastNonNull(fitness7, "weight_lb");
  const bodyFatLatest = lastNonNull(fitness7, "body_fat_pct");
  const stepsLatest = lastNonNull(recovery7, "steps");
  const activeCalLatest = lastNonNull(recovery7, "active_cal");

  return (
    <section className="db-section">
      <h2 className="db-section-label">
        Body &amp; Fitness<span className="meta">7-day average</span>
      </h2>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
          gap: "var(--space-6)",
        }}
      >
        <SummaryCell
          label="Weight"
          unit="lb"
          avgValue={weightAvg}
          latestValue={weightLatest?.value ?? null}
          latestDate={weightLatest?.date ?? null}
          series={weightSeries}
          higherIsBetter={false}
          digits={1}
          ariaLabel="Weight, last 7 days"
          today={today}
        />
        <SummaryCell
          label="Body fat"
          unit="%"
          avgValue={bodyFatAvg}
          latestValue={bodyFatLatest?.value ?? null}
          latestDate={bodyFatLatest?.date ?? null}
          series={bodyFatSeries}
          higherIsBetter={false}
          digits={1}
          ariaLabel="Body fat percent, last 7 days"
          today={today}
        />
        <SummaryCell
          label="Steps"
          avgValue={stepsAvg}
          latestValue={stepsLatest?.value ?? null}
          latestDate={stepsLatest?.date ?? null}
          series={stepsSeries}
          higherIsBetter
          digits={0}
          ariaLabel="Steps, last 7 days"
          today={today}
        />
        <SummaryCell
          label="Active cal"
          avgValue={activeCalAvg}
          latestValue={activeCalLatest?.value ?? null}
          latestDate={activeCalLatest?.date ?? null}
          series={activeCalSeries}
          higherIsBetter
          digits={0}
          ariaLabel="Active calories, last 7 days"
          today={today}
        />
      </div>

      <p
        style={{
          marginTop: "var(--space-5)",
          fontSize: "var(--t-micro)",
          color: "var(--color-text-faint)",
          letterSpacing: "0.02em",
        }}
      >
        Deeper trends, sleep stages, HRV, recovery, and full body composition live on{" "}
        <a
          href="/fitness"
          style={{
            color: "var(--color-text)",
            textDecoration: "none",
            borderBottom: "1px solid var(--rule)",
            paddingBottom: "1px",
          }}
        >
          Fitness →
        </a>
      </p>
    </section>
  );
}
