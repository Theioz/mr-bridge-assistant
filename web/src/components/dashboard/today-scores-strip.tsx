import type { RecoveryMetrics } from "@/lib/types";

import { readinessAdvice, readinessFlagged } from "@/lib/readiness";

// Same colour rule as the Health Breakdown score slots: accent when flagged, otherwise text.
// Before #761 this strip had its own red/amber/green cut-offs (60/80) that disagreed with
// the breakdown's (55) about the very same number.
function scoreColor(score: number | null): string {
  if (score == null) return "var(--color-text-muted)";
  return readinessFlagged(score) ? "var(--accent)" : "var(--color-text)";
}

function statusText(score: number | null): string {
  const a = readinessAdvice(score);
  if (!a) return "";
  return `Readiness ${a.label} — ${a.advice}`;
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

interface Props {
  /** The most recent recovery row — the same one Health Breakdown renders. */
  recovery: Pick<RecoveryMetrics, "date" | "readiness" | "sleep_score" | "source">;
  /** Today in the user's timezone, to label the row "today" only when it is. */
  today: string;
}

// ── Component ────────────────────────────────────────────────────────────────

export default function TodayScoresStrip({ recovery, today }: Props) {
  const status = statusText(recovery.readiness);
  const isToday = recovery.date === today;

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
          color: scoreColor(recovery.readiness),
          lineHeight: 1,
        }}
      >
        {recovery.readiness ?? "—"}
      </span>
      <span
        style={{
          fontSize: "var(--t-micro)",
          textTransform: "uppercase",
          letterSpacing: "0.14em",
          color: "var(--color-text-faint)",
        }}
      >
        Readiness · {isToday ? "today" : "latest"}
      </span>
      <span
        className="tnum"
        style={{
          fontSize: "var(--t-meta)",
          color: "var(--color-text-muted)",
        }}
      >
        sleep {recovery.sleep_score ?? "—"}
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
        {recovery.source ?? "Oura"} · {fmtDate(recovery.date)}
      </span>
    </section>
  );
}
