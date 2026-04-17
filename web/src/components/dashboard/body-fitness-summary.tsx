import { Sparkline } from "@/components/charts/sparkline";
import type { FitnessLog, RecoveryMetrics } from "@/lib/types";

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

function deltaClass(direction: Direction, higherIsBetter: boolean): string {
  if (direction === "flat") return "delta-flat";
  const good = higherIsBetter ? direction === "up" : direction === "down";
  return good ? "delta-good" : "delta-bad";
}

function arrow(direction: Direction): string {
  return direction === "up" ? "↑" : direction === "down" ? "↓" : "→";
}

function direction(today: number, reference: number): Direction {
  const diff = today - reference;
  if (Math.abs(diff) < 0.0001) return "flat";
  return diff > 0 ? "up" : "down";
}

function formatNumber(n: number, digits = 1): string {
  if (Math.abs(n) >= 1000) {
    return n.toLocaleString("en-US", { maximumFractionDigits: 0 });
  }
  return n.toFixed(digits);
}

type CellProps = {
  label: string;
  unit?: string;
  avgValue: number | null;
  todayValue: number | null;
  series: number[];
  higherIsBetter: boolean;
  digits?: number;
  ariaLabel: string;
};

function SummaryCell({
  label,
  unit,
  avgValue,
  todayValue,
  series,
  higherIsBetter,
  digits = 1,
  ariaLabel,
}: CellProps) {
  const showDelta = avgValue !== null && todayValue !== null;
  const delta = showDelta ? todayValue - avgValue : 0;
  const dir = showDelta ? direction(todayValue, avgValue) : "flat";
  const deltaDigits = Math.abs(delta) >= 1000 ? 0 : digits;
  const deltaText = showDelta
    ? `${arrow(dir)}${formatNumber(Math.abs(delta), deltaDigits)}`
    : "—";

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
          <span style={{ color: "var(--color-text-faint)" }}>yesterday</span>{" "}
          {todayValue !== null ? formatNumber(todayValue, digits) : "—"}
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

  const weightToday = weightSeries.length > 0 ? weightSeries[weightSeries.length - 1] : null;
  const bodyFatToday =
    bodyFatSeries.length > 0 ? bodyFatSeries[bodyFatSeries.length - 1] : null;
  const stepsToday = stepsSeries.length > 0 ? stepsSeries[stepsSeries.length - 1] : null;
  const activeCalToday =
    activeCalSeries.length > 0 ? activeCalSeries[activeCalSeries.length - 1] : null;

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
          todayValue={weightToday}
          series={weightSeries}
          higherIsBetter={false}
          digits={1}
          ariaLabel="Weight, last 7 days"
        />
        <SummaryCell
          label="Body fat"
          unit="%"
          avgValue={bodyFatAvg}
          todayValue={bodyFatToday}
          series={bodyFatSeries}
          higherIsBetter={false}
          digits={1}
          ariaLabel="Body fat percent, last 7 days"
        />
        <SummaryCell
          label="Steps"
          avgValue={stepsAvg}
          todayValue={stepsToday}
          series={stepsSeries}
          higherIsBetter
          digits={0}
          ariaLabel="Steps, last 7 days"
        />
        <SummaryCell
          label="Active cal"
          avgValue={activeCalAvg}
          todayValue={activeCalToday}
          series={activeCalSeries}
          higherIsBetter
          digits={0}
          ariaLabel="Active calories, last 7 days"
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
