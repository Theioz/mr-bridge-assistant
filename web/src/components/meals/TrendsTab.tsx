"use client";

import { useState } from "react";
import { ChartFrame, TrendLine } from "@/components/charts/primitives";
import { formatDate } from "@/lib/chart-utils";
import { todayString } from "@/lib/timezone";
import type { MacroGoals } from "@/lib/nutrition/daily-macros";
import type { DailyMacroTotals } from "./meals-shared";

// ─── Trends Tab ───────────────────────────────────────────────────────────────

type TrendWindow = "7d" | "30d";

export function TrendsTab({
  macroTrends,
  macroGoals,
}: {
  macroTrends: DailyMacroTotals[];
  macroGoals: MacroGoals;
}) {
  const [trendWindow, setTrendWindow] = useState<TrendWindow>("7d");
  const days = trendWindow === "7d" ? 7 : 30;
  const today = todayString();

  const sliced = macroTrends.slice(-days);
  const labels = sliced.map((d) => formatDate(d.date));
  const todayIdx = sliced[sliced.length - 1]?.date === today ? sliced.length - 1 : -1;
  const endRight = todayIdx >= 0 ? "Today" : (labels[labels.length - 1] ?? "");
  const latest = sliced[sliced.length - 1] ?? null;
  const windowLabel = trendWindow.toUpperCase();

  const calRef =
    macroGoals.calories != null
      ? [{ y: macroGoals.calories, label: `Goal ${macroGoals.calories}`, dashed: true }]
      : [];
  const proteinRef =
    macroGoals.protein != null
      ? [{ y: macroGoals.protein, label: `Goal ${macroGoals.protein}g`, dashed: true }]
      : [];
  const carbsRef =
    macroGoals.carbs != null
      ? [{ y: macroGoals.carbs, label: `Goal ${macroGoals.carbs}g`, dashed: true }]
      : [];
  const fatRef =
    macroGoals.fat != null
      ? [{ y: macroGoals.fat, label: `Goal ${macroGoals.fat}g`, dashed: true }]
      : [];
  const fiberRef =
    macroGoals.fiber != null
      ? [{ y: macroGoals.fiber, label: `Goal ${macroGoals.fiber}g`, dashed: true }]
      : [];

  const WindowToggle = (
    <div
      className="flex items-center gap-0.5 p-0.5"
      style={{ border: "1px solid var(--rule)", borderRadius: "var(--r-1)" }}
    >
      {(["7d", "30d"] as const).map((opt) => {
        const active = opt === trendWindow;
        return (
          <button
            key={opt}
            onClick={() => setTrendWindow(opt)}
            className="text-xs font-medium flex items-center justify-center cursor-pointer"
            style={{
              background: active ? "var(--accent)" : "transparent",
              color: active ? "var(--color-text-on-cta)" : "var(--color-text-muted)",
              borderRadius: "var(--r-1)",
              minHeight: 32,
              padding: "0 var(--space-3)",
              border: "none",
              transition:
                "background var(--motion-fast) var(--ease-out-quart), color var(--motion-fast) var(--ease-out-quart)",
            }}
          >
            {opt.toUpperCase()}
          </button>
        );
      })}
    </div>
  );

  return (
    <div className="flex flex-col" style={{ gap: "var(--space-6)" }}>
      <div className="flex items-center justify-between">
        <h2 className="db-section-label">Macro trends</h2>
        {WindowToggle}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2" style={{ gap: "var(--space-7)" }}>
        <ChartFrame
          label={`Calories · ${windowLabel}`}
          value={latest ? `${latest.calories} kcal` : "—"}
        >
          <TrendLine
            labels={labels}
            values={sliced.map((d) => d.calories)}
            todayIndex={todayIdx}
            refLines={calRef}
            formatValue={(v) => `${Math.round(v)} kcal`}
            ariaLabel={`Calorie intake ${windowLabel}`}
            endpointRight={endRight}
            fill
          />
        </ChartFrame>

        <ChartFrame label={`Protein · ${windowLabel}`} value={latest ? `${latest.protein}g` : "—"}>
          <TrendLine
            labels={labels}
            values={sliced.map((d) => d.protein)}
            todayIndex={todayIdx}
            refLines={proteinRef}
            formatValue={(v) => `${Math.round(v)}g`}
            ariaLabel={`Protein intake ${windowLabel}`}
            endpointRight={endRight}
          />
        </ChartFrame>

        <ChartFrame label={`Carbs · ${windowLabel}`} value={latest ? `${latest.carbs}g` : "—"}>
          <TrendLine
            labels={labels}
            values={sliced.map((d) => d.carbs)}
            todayIndex={todayIdx}
            refLines={carbsRef}
            formatValue={(v) => `${Math.round(v)}g`}
            ariaLabel={`Carbs intake ${windowLabel}`}
            endpointRight={endRight}
          />
        </ChartFrame>

        <ChartFrame label={`Fat · ${windowLabel}`} value={latest ? `${latest.fat}g` : "—"}>
          <TrendLine
            labels={labels}
            values={sliced.map((d) => d.fat)}
            todayIndex={todayIdx}
            refLines={fatRef}
            formatValue={(v) => `${Math.round(v)}g`}
            ariaLabel={`Fat intake ${windowLabel}`}
            endpointRight={endRight}
          />
        </ChartFrame>

        <ChartFrame
          label={`Fiber · ${windowLabel}`}
          value={latest?.fiber != null ? `${latest.fiber}g` : "—"}
        >
          <TrendLine
            labels={labels}
            values={sliced.map((d) => d.fiber)}
            todayIndex={todayIdx}
            refLines={fiberRef}
            formatValue={(v) => `${v.toFixed(1)}g`}
            ariaLabel={`Fiber intake ${windowLabel}`}
            endpointRight={endRight}
          />
        </ChartFrame>

        <ChartFrame
          label={`Sugar · ${windowLabel}`}
          value={latest?.sugar != null ? `${latest.sugar}g` : "—"}
        >
          <TrendLine
            labels={labels}
            values={sliced.map((d) => d.sugar)}
            todayIndex={todayIdx}
            refLines={[]}
            formatValue={(v) => `${v.toFixed(1)}g`}
            ariaLabel={`Sugar intake ${windowLabel}`}
            endpointRight={endRight}
          />
        </ChartFrame>
      </div>
    </div>
  );
}
