"use client";

import { useState, useTransition } from "react";
import type { HabitRegistry, HabitLog } from "@/lib/types";

interface Props {
  habits: HabitRegistry[];
  logs: HabitLog[];
  dates: string[];
  range: 7 | 30 | 90;
  toggleAction: (habitId: string, date: string, completed: boolean) => Promise<void>;
}

function formatHeader(dateStr: string): string {
  return new Date(dateStr + "T00:00:00").toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function groupByWeek(dates: string[]): { label: string; dates: string[] }[] {
  const weeks: { label: string; dates: string[] }[] = [];
  for (let i = 0; i < dates.length; i += 7) {
    const chunk = dates.slice(i, i + 7);
    weeks.push({ label: formatHeader(chunk[0]), dates: chunk });
  }
  return weeks;
}

function countToOpacity(count: number, total: number): number {
  if (total === 0) return 0;
  const ratio = count / total;
  if (ratio === 0) return 0;
  if (ratio <= 0.3) return 0.4;
  if (ratio <= 0.57) return 0.55;
  if (ratio <= 0.86) return 0.7;
  return 0.85;
}

const thStyle: React.CSSProperties = {
  color: "var(--color-text-faint)",
  fontSize: "var(--t-micro)",
  fontWeight: 400,
  letterSpacing: "0.04em",
  textAlign: "center",
  padding: "var(--space-2) var(--space-1)",
};

const tdBaseStyle: React.CSSProperties = {
  padding: "var(--space-2) var(--space-1)",
  textAlign: "center",
  verticalAlign: "middle",
};

export default function HabitHistory({ habits, logs, dates, range, toggleAction }: Props) {
  const logMap = new Map(logs.map((l) => [`${l.habit_id}:${l.date}`, l.completed]));
  const [overrides, setOverrides] = useState<Record<string, boolean>>({});
  const [, startTransition] = useTransition();

  const today = dates[dates.length - 1];

  function getCompleted(habitId: string, date: string): boolean | undefined {
    const key = `${habitId}:${date}`;
    return key in overrides ? overrides[key] : logMap.get(key);
  }

  function handleCellClick(habitId: string, date: string) {
    const key = `${habitId}:${date}`;
    const current = getCompleted(habitId, date);
    const next = !(current ?? false);
    setOverrides((prev) => ({ ...prev, [key]: next }));
    startTransition(async () => {
      try {
        await toggleAction(habitId, date, next);
      } catch {
        setOverrides((prev) => {
          const updated = { ...prev };
          if (current === undefined) {
            delete updated[key];
          } else {
            updated[key] = current;
          }
          return updated;
        });
      }
    });
  }

  const nameCellStyle: React.CSSProperties = {
    padding: "var(--space-2) var(--space-3) var(--space-2) 0",
    color: "var(--color-text)",
    fontSize: "var(--t-meta)",
    maxWidth: "10rem",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  };

  if (range === 90) {
    const weeks = groupByWeek(dates);
    return (
      <div className="overflow-x-auto">
        <table className="w-full tnum" style={{ borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th
                style={{
                  ...thStyle,
                  textAlign: "left",
                  padding: "var(--space-2) var(--space-3) var(--space-2) 0",
                }}
              >
                Habit
              </th>
              {weeks.map((w) => (
                <th key={w.label} style={{ ...thStyle, whiteSpace: "nowrap" }}>
                  {w.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {habits.map((h, i) => (
              <tr
                key={h.id}
                style={i > 0 ? { borderTop: "1px solid var(--rule-soft)" } : undefined}
              >
                <td style={nameCellStyle}>{h.name}</td>
                {weeks.map((w) => {
                  const count = w.dates.filter((d) => getCompleted(h.id, d) === true).length;
                  const total = w.dates.length;
                  const op = countToOpacity(count, total);
                  return (
                    <td key={w.label} style={tdBaseStyle}>
                      <span
                        className="tnum"
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center",
                          width: 22,
                          height: 14,
                          borderRadius: 3,
                          fontSize: "var(--t-micro)",
                          color: op >= 0.55 ? "var(--color-bg)" : "var(--color-text-muted)",
                          background: op > 0 ? "var(--color-text)" : "var(--rule)",
                          opacity: op > 0 ? op : 1,
                        }}
                        title={`${count}/${total} days`}
                      >
                        {count > 0 ? count : ""}
                      </span>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full" style={{ borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th
              style={{
                ...thStyle,
                textAlign: "left",
                padding: "var(--space-2) var(--space-3) var(--space-2) 0",
              }}
            >
              Habit
            </th>
            {dates.map((d) => (
              <th key={d} style={{ ...thStyle, whiteSpace: "nowrap" }}>
                {formatHeader(d)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {habits.map((h, i) => (
            <tr key={h.id} style={i > 0 ? { borderTop: "1px solid var(--rule-soft)" } : undefined}>
              <td style={nameCellStyle}>{h.emoji ? `${h.emoji} ${h.name}` : h.name}</td>
              {dates.map((d) => {
                const done = getCompleted(h.id, d);
                const isToday = d === today;
                return (
                  <td key={d} style={tdBaseStyle}>
                    <button
                      onClick={() => handleCellClick(h.id, d)}
                      className="cursor-pointer"
                      style={{
                        position: "relative",
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        width: 44,
                        height: 44,
                        padding: 0,
                        background: "transparent",
                        border: 0,
                      }}
                      title={`${h.name} — ${formatHeader(d)}`}
                      aria-label={`${h.name} ${formatHeader(d)}: ${done ? "completed" : "not completed"}`}
                      aria-pressed={done === true}
                    >
                      <span
                        aria-hidden
                        style={
                          done === true
                            ? {
                                width: 14,
                                height: 14,
                                borderRadius: 3,
                                background: "var(--color-text)",
                                opacity: 0.85,
                              }
                            : {
                                width: 14,
                                height: 14,
                                borderRadius: 3,
                                background: "var(--rule)",
                              }
                        }
                      />
                      {isToday && (
                        <span
                          aria-hidden
                          style={{
                            position: "absolute",
                            width: 18,
                            height: 18,
                            borderRadius: 4,
                            border: "1.5px solid var(--accent)",
                            pointerEvents: "none",
                          }}
                        />
                      )}
                    </button>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
