"use client";

import { useState } from "react";
import type { HabitRegistry, HabitLog } from "@/lib/types";

interface Props {
  habits: HabitRegistry[];    // active habits only — used for completion ratio denominator
  registry: HabitRegistry[];  // all habits including inactive — used for name lookup
  logs: HabitLog[];           // all logs for the window
  dates: string[];            // ordered list of date strings YYYY-MM-DD
}

function fmtDate(d: string) {
  return new Date(d + "T00:00:00").toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

export function HabitHeatmap({ habits, registry, logs, dates }: Props) {
  const [tooltip, setTooltip] = useState<{ date: string; names: string[] } | null>(null);

  if (habits.length === 0 || dates.length === 0) {
    return (
      <div
        className="rounded-xl p-5 transition-all duration-200 card-lift"
        style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)" }}
      >
        <p className="text-xs uppercase tracking-widest mb-3" style={{ color: "var(--color-text-muted)" }}>
          Completion Heatmap — 90 Days
        </p>
        <p style={{ fontSize: 14, color: "var(--color-text-faint)" }}>No habit data</p>
      </div>
    );
  }

  // Build completion map: date → Set<habitId>
  const completionMap = new Map<string, Set<string>>();
  for (const log of logs) {
    if (!log.completed) continue;
    if (!completionMap.has(log.date)) completionMap.set(log.date, new Set());
    completionMap.get(log.date)!.add(log.habit_id);
  }

  // Build habit name map from full registry (includes archived habits)
  const habitNames = new Map(registry.map((h) => [h.id, h.name]));

  // Group dates into weeks (columns of 7)
  const weeks: string[][] = [];
  // Pad start so first column aligns to Sunday (0) or Monday (1)
  const firstDate = new Date(dates[0] + "T00:00:00");
  const startDay = firstDate.getDay(); // 0 = Sunday
  const paddedDates = Array(startDay).fill(null).concat(dates);
  for (let i = 0; i < paddedDates.length; i += 7) {
    weeks.push(paddedDates.slice(i, i + 7));
  }

  const totalHabits = habits.length;

  function cellColor(date: string | null): string {
    if (!date) return "transparent";
    const completed = completionMap.get(date);
    if (!completed || completed.size === 0) return "var(--color-border)";
    const ratio = completed.size / totalHabits;
    if (ratio >= 1) return "var(--color-positive)";
    if (ratio >= 0.66) return "var(--color-positive-light)";
    if (ratio >= 0.33) return "var(--color-positive-lighter)";
    return "var(--color-positive-lightest)";
  }

  return (
    <div
      className="rounded-xl p-5 transition-all duration-200 card-lift"
      style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)" }}
    >
      <p className="text-xs uppercase tracking-widest mb-4" style={{ color: "var(--color-text-muted)", letterSpacing: "0.07em" }}>
        Completion Heatmap — 90 Days
      </p>

      <div className="overflow-x-auto">
        <div className="flex gap-1" style={{ minWidth: weeks.length * 14 }}>
          {weeks.map((week, wi) => (
            <div key={wi} className="flex flex-col gap-1">
              {week.map((date, di) => (
                <div
                  key={di}
                  className="rounded-sm cursor-default transition-opacity duration-100"
                  style={{
                    width: 11,
                    height: 11,
                    background: cellColor(date),
                    opacity: date ? 1 : 0,
                  }}
                  onMouseEnter={() => {
                    if (!date) return;
                    const completed = completionMap.get(date);
                    const names = completed
                      ? Array.from(completed).map((id) => habitNames.get(id) ?? id)
                      : [];
                    setTooltip({ date, names });
                  }}
                  onMouseLeave={() => setTooltip(null)}
                />
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* Tooltip */}
      {tooltip && (
        <div
          className="mt-3 px-3 py-2 rounded-lg"
          style={{
            background: "var(--color-surface-raised)",
            border: "1px solid var(--color-border)",
            fontSize: 12,
          }}
        >
          <p style={{ color: "var(--color-text-muted)", marginBottom: 4 }}>{fmtDate(tooltip.date)}</p>
          {tooltip.names.length === 0 ? (
            <p style={{ color: "var(--color-text-faint)" }}>No habits completed</p>
          ) : (
            <p style={{ color: "var(--color-text)" }}>{tooltip.names.join(", ")}</p>
          )}
        </div>
      )}

      {/* Legend */}
      <div className="flex items-center gap-1.5 mt-4">
        <span style={{ fontSize: 10, color: "var(--color-text-muted)" }}>Less</span>
        {["var(--color-border)", "var(--color-positive-lightest)", "var(--color-positive-lighter)", "var(--color-positive-light)", "var(--color-positive)"].map((c, i) => (
          <div key={i} className="rounded-sm" style={{ width: 11, height: 11, background: c }} />
        ))}
        <span style={{ fontSize: 10, color: "var(--color-text-muted)" }}>More</span>
      </div>
    </div>
  );
}
