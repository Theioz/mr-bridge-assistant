import type { RecoveryMetrics } from "@/lib/types";

// ── Score helpers (scoped to this file) ─────────────────────────────────────

function scoreColor(score: number | null): string {
  if (score == null) return "var(--color-text-muted)";
  if (score >= 80) return "var(--color-positive)";
  if (score >= 60) return "var(--color-warning)";
  return "var(--color-danger)";
}

function statusText(score: number | null): string {
  if (score == null) return "";
  if (score >= 85) return "Recovery optimal — push hard today";
  if (score >= 70) return "Recovery good — normal training";
  if (score >= 55) return "Recovery moderate — moderate effort";
  if (score >= 40) return "Readiness low — consider deload";
  return "Readiness critical — rest day recommended";
}

function fmtDate(dateStr: string): string {
  // "2026-04-13" → "Apr 13"
  const [, month, day] = dateStr.split("-");
  const months = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  return `${months[parseInt(month) - 1]} ${parseInt(day)}`;
}

// ── Props ────────────────────────────────────────────────────────────────────

type TodayScores = Pick<RecoveryMetrics, "date" | "readiness" | "sleep_score" | "source">;

interface Props {
  today: TodayScores;
}

// ── Component ────────────────────────────────────────────────────────────────

export default function TodayScoresStrip({ today }: Props) {
  const status = statusText(today.readiness);

  return (
    <section
      className="font-heading"
      style={{
        display: "flex",
        flexWrap: "wrap",
        alignItems: "baseline",
        gap: "var(--space-5)",
        padding: "var(--space-3) 0",
        borderBottom: "1px solid var(--rule-soft)",
      }}
    >
      <span
        className="tnum"
        style={{
          fontSize: "2.75rem",
          fontWeight: 400,
          letterSpacing: "-0.02em",
          color: scoreColor(today.readiness),
          lineHeight: 1,
        }}
      >
        {today.readiness ?? "—"}
      </span>
      <span
        style={{
          fontSize: "var(--t-micro)",
          textTransform: "uppercase",
          letterSpacing: "0.14em",
          color: "var(--color-text-faint)",
        }}
      >
        Readiness · today
      </span>
      <span
        className="tnum"
        style={{
          fontSize: "var(--t-meta)",
          color: "var(--color-text-muted)",
        }}
      >
        sleep {today.sleep_score ?? "—"}
      </span>
      {status && (
        <span
          style={{
            fontSize: "var(--t-meta)",
            color: "var(--color-text-muted)",
            marginLeft: "auto",
          }}
        >
          {status}
        </span>
      )}
      <span
        style={{
          fontSize: "var(--t-micro)",
          color: "var(--color-text-faint)",
        }}
      >
        {today.source ?? "Oura"} · {fmtDate(today.date)}
      </span>
    </section>
  );
}
