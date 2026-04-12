"use client";

import { TrendingUp, TrendingDown, Minus } from "lucide-react";

interface MetricCardProps {
  label: string;
  value: string | number | null;
  unit?: string;
  delta?: number | null;
  /** When true, a negative delta is health-positive (e.g. weight, body fat) */
  healthPositiveIsDown?: boolean;
}

function deltaColor(delta: number, healthPositiveIsDown: boolean): string {
  const isPositive = healthPositiveIsDown ? delta < 0 : delta > 0;
  if (isPositive) return "var(--color-positive)";
  if (delta === 0) return "var(--color-text-muted)";
  return "var(--color-danger)";
}

function DeltaIcon({ delta, healthPositiveIsDown }: { delta: number; healthPositiveIsDown: boolean }) {
  if (delta === 0) return <Minus size={13} />;
  const isPositive = healthPositiveIsDown ? delta < 0 : delta > 0;
  return isPositive ? <TrendingUp size={13} /> : <TrendingDown size={13} />;
}

export function MetricCard({
  label,
  value,
  unit,
  delta,
  healthPositiveIsDown = false,
}: MetricCardProps) {
  const showDelta = delta != null && !isNaN(delta);

  return (
    <div
      className="rounded-xl p-5 transition-colors duration-200"
      style={{
        background: "var(--color-surface)",
        border: "1px solid var(--color-border)",
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLElement).style.borderColor = "#2A2F45";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLElement).style.borderColor = "var(--color-border)";
      }}
    >
      <p
        className="text-xs uppercase tracking-widest mb-3"
        style={{ color: "var(--color-text-muted)", letterSpacing: "0.07em" }}
      >
        {label}
      </p>

      <div className="flex items-baseline gap-1.5">
        <span
          className="font-heading"
          style={{ fontSize: 32, fontWeight: 700, lineHeight: 1, color: "var(--color-text)" }}
        >
          {value ?? "—"}
        </span>
        {unit && value != null && (
          <span style={{ fontSize: 14, color: "var(--color-text-muted)" }}>{unit}</span>
        )}
      </div>

      {showDelta && (
        <div
          className="flex items-center gap-1 mt-2"
          style={{
            fontSize: 13,
            fontWeight: 500,
            color: deltaColor(delta!, healthPositiveIsDown),
          }}
        >
          <DeltaIcon delta={delta!} healthPositiveIsDown={healthPositiveIsDown} />
          <span>
            {delta! > 0 ? "+" : ""}
            {delta!.toFixed(1)}
            {unit ? ` ${unit}` : ""}
          </span>
          <span style={{ color: "var(--color-text-muted)", fontWeight: 400 }}>vs prev</span>
        </div>
      )}

      {!showDelta && (
        <p className="mt-2" style={{ fontSize: 13, color: "var(--color-text-faint)" }}>
          No prior data
        </p>
      )}
    </div>
  );
}
