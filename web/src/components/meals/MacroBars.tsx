// Today's macro bars — moved out of MealsClient so the dashboard's Today's food section renders
// the exact same rows (#761) instead of a lookalike. Presentational only; the numbers come from
// lib/nutrition/daily-macros.ts.

import type { MacroGoals, MacroTotals } from "@/lib/nutrition/daily-macros";

function progressColor(pct: number): string {
  if (pct > 100) return "var(--color-danger)";
  if (pct >= 85) return "var(--color-warning)";
  return "var(--color-positive)";
}

interface MacroBarProps {
  label: string;
  unit: string;
  consumed: number;
  goal: number | null;
}

// Sugar has no goal — we show a running total for awareness (#304).
export function SugarTotalRow({ sugar }: { sugar: number | null }) {
  return (
    <div
      className="flex items-baseline justify-between"
      style={{
        paddingTop: "var(--space-3)",
        paddingBottom: "var(--space-3)",
        borderTop: "1px solid var(--rule-soft)",
      }}
    >
      <span style={{ fontSize: "var(--t-meta)", fontWeight: 500, color: "var(--color-text)" }}>
        Sugar
      </span>
      <span className="tnum" style={{ fontSize: "var(--t-meta)", color: "var(--color-text)" }}>
        {sugar === null ? "—" : sugar}
        <span style={{ color: "var(--color-text-muted)", fontSize: "var(--t-micro)" }}>g</span>
      </span>
    </div>
  );
}

export function MacroBar({ label, unit, consumed, goal }: MacroBarProps) {
  if (goal === null) return null;
  const pct = goal > 0 ? (consumed / goal) * 100 : 0;
  const color = progressColor(pct);
  const remaining = goal - consumed;
  const isOver = remaining < 0;
  const clamped = Math.min(pct, 100);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "var(--space-2)",
        paddingTop: "var(--space-3)",
        paddingBottom: "var(--space-3)",
        borderTop: "1px solid var(--rule-soft)",
      }}
    >
      <div className="flex items-baseline justify-between">
        <span style={{ fontSize: "var(--t-meta)", fontWeight: 500, color: "var(--color-text)" }}>
          {label}
        </span>
        <div className="flex items-baseline tnum" style={{ gap: "var(--space-2)" }}>
          <span style={{ fontSize: "var(--t-meta)", color: "var(--color-text)" }}>
            {consumed}
            <span style={{ color: "var(--color-text-muted)", fontSize: "var(--t-micro)" }}>
              {unit}
            </span>
          </span>
          <span style={{ fontSize: "var(--t-micro)", color: "var(--color-text-faint)" }}>/</span>
          <span style={{ fontSize: "var(--t-micro)", color: "var(--color-text-muted)" }}>
            {goal}
            {unit}
          </span>
          <span
            style={{
              fontSize: "var(--t-micro)",
              fontWeight: 500,
              color,
              minWidth: 64,
              textAlign: "right",
            }}
          >
            {isOver ? `+${Math.abs(remaining)}${unit} over` : `${remaining}${unit} left`}
          </span>
        </div>
      </div>
      <div
        className="rounded-full overflow-hidden"
        style={{ height: 3, background: "var(--rule-soft)" }}
      >
        <div
          className="h-full"
          style={{
            width: "100%",
            transform: `scaleX(${clamped / 100})`,
            transformOrigin: "left center",
            background: color,
            transition:
              "transform var(--motion-slow) var(--ease-out-quart), background-color var(--motion-slow) var(--ease-out-quart)",
            willChange: "transform",
          }}
        />
      </div>
    </div>
  );
}

export type MacroKey = "calories" | "protein" | "carbs" | "fat" | "fiber";

const ROWS: Record<MacroKey, { label: string; unit: string }> = {
  calories: { label: "Calories", unit: " kcal" },
  protein: { label: "Protein", unit: "g" },
  carbs: { label: "Carbs", unit: "g" },
  fat: { label: "Fat", unit: "g" },
  fiber: { label: "Fiber", unit: "g" },
};

const ALL: MacroKey[] = ["calories", "protein", "carbs", "fat", "fiber"];

/** A stack of MacroBar rows, in the given order. A row without a goal renders nothing. */
export function MacroBars({
  totals,
  goals,
  include = ALL,
}: {
  totals: MacroTotals;
  goals: MacroGoals;
  include?: MacroKey[];
}) {
  return (
    <div>
      {include.map((k) => (
        <MacroBar
          key={k}
          label={ROWS[k].label}
          unit={ROWS[k].unit}
          consumed={k === "fiber" ? (totals.fiber ?? 0) : totals[k]}
          goal={goals[k]}
        />
      ))}
    </div>
  );
}
