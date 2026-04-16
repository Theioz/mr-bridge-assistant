import type { RecoveryMetrics } from "@/lib/types";

// ── Score helpers (scoped to this file) ─────────────────────────────────────

function scoreColor(score: number | null): string {
  if (score == null) return "var(--color-text-muted)";
  if (score >= 80)   return "var(--color-positive)";
  if (score >= 60)   return "var(--color-warning)";
  return "var(--color-danger)";
}

function accentColor(score: number | null): string {
  if (score == null) return "var(--color-border)";
  if (score >= 80)   return "var(--color-positive)";
  if (score >= 60)   return "var(--color-warning)";
  return "var(--color-danger)";
}

function statusText(score: number | null): string {
  if (score == null) return "";
  if (score >= 85)   return "Recovery optimal — push hard today";
  if (score >= 70)   return "Recovery good — normal training";
  if (score >= 55)   return "Recovery moderate — moderate effort";
  if (score >= 40)   return "Readiness low — consider deload";
  return "Readiness critical — rest day recommended";
}

function fmtDate(dateStr: string): string {
  // "2026-04-13" → "Apr 13"
  const [, month, day] = dateStr.split("-");
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return `${months[parseInt(month) - 1]} ${parseInt(day)}`;
}

// ── Props ────────────────────────────────────────────────────────────────────

type TodayScores = Pick<RecoveryMetrics, "date" | "readiness" | "sleep_score" | "source">;

interface Props {
  today: TodayScores;
}

// ── Component ────────────────────────────────────────────────────────────────

export default function TodayScoresStrip({ today }: Props) {
  const accent  = accentColor(today.readiness);
  const status  = statusText(today.readiness);

  return (
    <div
      className="rounded-xl overflow-hidden transition-all duration-200 card-lift"
      style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)" }}
    >
      {/* 2px colored top bar keyed to readiness */}
      <div style={{ height: 2, background: accent, flexShrink: 0 }} />

      <div
        className="flex flex-col sm:flex-row sm:items-center gap-4 px-5 py-3"
        style={{ minHeight: 48 }}
      >
        {/* TODAY tag */}
        <span
          className="text-xs font-semibold uppercase tracking-widest shrink-0"
          style={{ color: "var(--color-text-faint)", letterSpacing: "0.1em" }}
        >
          Today
        </span>

        {/* Scores */}
        <div className="flex items-center gap-0 shrink-0">
          {/* Readiness */}
          <div className="flex items-baseline gap-1.5 pr-4">
            <span className="text-xs uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>
              Readiness
            </span>
            <span
              className="font-heading font-bold tabular-nums"
              style={{ fontSize: 22, color: scoreColor(today.readiness), lineHeight: 1 }}
            >
              {today.readiness ?? "—"}
            </span>
          </div>

          {/* Divider */}
          <div
            style={{
              width: 1,
              height: 18,
              background: "var(--color-border)",
              flexShrink: 0,
            }}
          />

          {/* Sleep */}
          <div className="flex items-baseline gap-1.5 pl-4">
            <span className="text-xs uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>
              Sleep
            </span>
            <span
              className="font-heading font-bold tabular-nums"
              style={{ fontSize: 22, color: scoreColor(today.sleep_score), lineHeight: 1 }}
            >
              {today.sleep_score ?? "—"}
            </span>
          </div>
        </div>

        {/* Status text — pushed right, wraps on small screens */}
        {status && (
          <span
            className="text-xs font-medium ml-auto shrink-0"
            style={{ color: scoreColor(today.readiness) }}
          >
            {status}
          </span>
        )}

        {/* Source + date — faint, far right */}
        <span
          className="text-xs shrink-0"
          style={{ color: "var(--color-text-faint)" }}
        >
          {today.source ?? "Oura"} · live · {fmtDate(today.date)}
        </span>
      </div>
    </div>
  );
}
