"use client";

import { useState } from "react";
import type { HabitRegistry, HabitLog } from "@/lib/types";

interface Props {
  habits: HabitRegistry[];    // active habits only — used for completion ratio denominator
  registry: HabitRegistry[];  // all habits including inactive — used for name lookup
  logs: HabitLog[];           // all logs for the window
  dates: string[];            // ordered list of date strings YYYY-MM-DD
}

const CELL = 20;
const GAP = 5;

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
      <section>
        <h2 className="db-section-label">Completion Heatmap</h2>
        <p style={{ fontSize: "var(--t-body)", color: "var(--color-text-faint)" }}>No habit data</p>
      </section>
    );
  }

  const completionMap = new Map<string, Set<string>>();
  for (const log of logs) {
    if (!log.completed) continue;
    if (!completionMap.has(log.date)) completionMap.set(log.date, new Set());
    completionMap.get(log.date)!.add(log.habit_id);
  }

  const habitNames = new Map(registry.map((h) => [h.id, h.name]));
  const today = dates[dates.length - 1];
  const totalHabits = habits.length;

  const firstDate = new Date(dates[0] + "T00:00:00");
  const startDay = firstDate.getDay();
  const paddedDates: (string | null)[] = Array(startDay).fill(null).concat(dates);
  const weeks: (string | null)[][] = [];
  for (let i = 0; i < paddedDates.length; i += 7) {
    weeks.push(paddedDates.slice(i, i + 7));
  }

  const svgWidth = weeks.length * CELL + (weeks.length - 1) * GAP;
  const svgHeight = 7 * CELL + 6 * GAP;

  function cellStyle(date: string): { fill: string; opacity: number } {
    const completed = completionMap.get(date);
    const ratio = completed ? completed.size / totalHabits : 0;
    // Missed cells use --color-border (darker than --rule) so each square
    // reads clearly on the watercolor canvas.
    if (ratio === 0) return { fill: "var(--color-border)", opacity: 1 };
    // Hits scale 0.4 → 0.85 (mockup baseline for fully-hit cell is 0.85).
    return { fill: "var(--color-text)", opacity: 0.4 + ratio * 0.45 };
  }

  return (
    <section>
      <h2 className="db-section-label">
        Completion Heatmap
        <span className="meta">· {dates.length}d</span>
      </h2>

      <div className="overflow-x-auto">
        <svg
          width={svgWidth}
          height={svgHeight}
          viewBox={`0 0 ${svgWidth} ${svgHeight}`}
          role="img"
          aria-label={`Habit completion heatmap over the last ${dates.length} days`}
          style={{ display: "block", maxWidth: "100%" }}
        >
          {weeks.map((week, wi) =>
            week.map((date, di) => {
              if (!date) return null;
              const { fill, opacity } = cellStyle(date);
              const x = wi * (CELL + GAP);
              const y = di * (CELL + GAP);
              const isToday = date === today;
              return (
                <g key={`${wi}-${di}`}>
                  <rect
                    x={x}
                    y={y}
                    width={CELL}
                    height={CELL}
                    rx={3}
                    fill={fill}
                    opacity={opacity}
                    style={{ cursor: "default" }}
                    onMouseEnter={() => {
                      const completed = completionMap.get(date);
                      const names = completed
                        ? Array.from(completed).map((id) => habitNames.get(id) ?? id)
                        : [];
                      setTooltip({ date, names });
                    }}
                    onMouseLeave={() => setTooltip(null)}
                  />
                  {isToday && (
                    <rect
                      x={x - 2}
                      y={y - 2}
                      width={CELL + 4}
                      height={CELL + 4}
                      rx={4}
                      fill="none"
                      stroke="var(--accent)"
                      strokeWidth={1.5}
                      pointerEvents="none"
                    />
                  )}
                </g>
              );
            })
          )}
        </svg>
      </div>

      {tooltip && (
        <div style={{ marginTop: "var(--space-3)", fontSize: "var(--t-micro)" }}>
          <p style={{ color: "var(--color-text-muted)", marginBottom: "var(--space-1)" }}>
            {fmtDate(tooltip.date)}
          </p>
          {tooltip.names.length === 0 ? (
            <p style={{ color: "var(--color-text-faint)" }}>No habits completed</p>
          ) : (
            <p style={{ color: "var(--color-text)" }}>{tooltip.names.join(", ")}</p>
          )}
        </div>
      )}

      <div
        className="flex items-center gap-1.5"
        style={{ marginTop: "var(--space-4)" }}
      >
        <span style={{ fontSize: "var(--t-micro)", color: "var(--color-text-faint)" }}>Less</span>
        {[
          { fill: "var(--color-border)", opacity: 1 },
          { fill: "var(--color-text)", opacity: 0.4 },
          { fill: "var(--color-text)", opacity: 0.55 },
          { fill: "var(--color-text)", opacity: 0.7 },
          { fill: "var(--color-text)", opacity: 0.85 },
        ].map((c, i) => (
          <span
            key={i}
            style={{
              width: CELL,
              height: CELL,
              borderRadius: 3,
              background: c.fill,
              opacity: c.opacity,
              display: "inline-block",
            }}
          />
        ))}
        <span style={{ fontSize: "var(--t-micro)", color: "var(--color-text-faint)" }}>More</span>
      </div>
    </section>
  );
}
