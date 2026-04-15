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
  if (total === 0) return 0.2;
  const ratio = count / total;
  if (ratio === 0) return 0.2;
  if (ratio <= 0.3) return 0.4;
  if (ratio <= 0.57) return 0.6;
  if (ratio <= 0.86) return 0.8;
  return 1;
}

export default function HabitHistory({ habits, logs, dates, range, toggleAction }: Props) {
  const logMap = new Map(logs.map((l) => [`${l.habit_id}:${l.date}`, l.completed]));
  const [overrides, setOverrides] = useState<Record<string, boolean>>({});
  const [, startTransition] = useTransition();

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

  const thStyle = { color: "var(--color-text-muted)" };
  const tdHabitStyle = { color: "var(--color-text)" };

  if (range === 90) {
    const weeks = groupByWeek(dates);
    return (
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr>
              <th className="text-left font-normal pb-2 pr-4 w-32" style={thStyle}>Habit</th>
              {weeks.map((w) => (
                <th key={w.label} className="font-normal pb-2 px-1 text-center whitespace-nowrap" style={thStyle}>
                  {w.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {habits.map((h) => (
              <tr key={h.id}>
                <td className="py-1.5 pr-4 truncate max-w-[8rem]" style={tdHabitStyle}>
                  {h.emoji} {h.name}
                </td>
                {weeks.map((w) => {
                  const count = w.dates.filter((d) => getCompleted(h.id, d) === true).length;
                  const total = w.dates.length;
                  const op = countToOpacity(count, total);
                  return (
                    <td key={w.label} className="py-1.5 px-1 text-center">
                      <span
                        className="inline-flex items-center justify-center w-6 h-5 rounded text-[10px] font-medium"
                        style={{
                          background: "var(--color-primary)",
                          color: "var(--color-text-on-cta)",
                          opacity: op,
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
      <table className="w-full text-xs">
        <thead>
          <tr>
            <th className="text-left font-normal pb-2 pr-4 w-32" style={thStyle}>Habit</th>
            {dates.map((d) => (
              <th key={d} className="font-normal pb-2 px-1 text-center whitespace-nowrap" style={thStyle}>
                {formatHeader(d)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {habits.map((h) => (
            <tr key={h.id}>
              <td className="py-1.5 pr-4 truncate max-w-[8rem]" style={tdHabitStyle}>
                {h.emoji} {h.name}
              </td>
              {dates.map((d) => {
                const done = getCompleted(h.id, d);
                return (
                  <td key={d} className="py-1.5 px-1 text-center">
                    <button
                      onClick={() => handleCellClick(h.id, d)}
                      className="inline-block w-4 h-4 rounded-full transition-all cursor-pointer"
                      style={
                        done === true
                          ? { background: "var(--color-primary)", border: "none" }
                          : { background: "transparent", border: "1px solid var(--color-border)", opacity: 0.6 }
                      }
                      title={`${h.name} — ${formatHeader(d)}`}
                    />
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
