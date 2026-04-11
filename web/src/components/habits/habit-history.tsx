"use client";

import { useState, useTransition } from "react";
import type { HabitRegistry, HabitLog } from "@/lib/types";

interface Props {
  habits: HabitRegistry[];
  logs: HabitLog[];
  dates: string[]; // ascending YYYY-MM-DD strings
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

function countToOpacity(count: number, total: number): string {
  if (total === 0) return "opacity-20";
  const ratio = count / total;
  if (ratio === 0) return "opacity-20";
  if (ratio <= 0.3) return "opacity-40";
  if (ratio <= 0.57) return "opacity-60";
  if (ratio <= 0.86) return "opacity-80";
  return "opacity-100";
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
        // revert on error
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

  if (range === 90) {
    const weeks = groupByWeek(dates);
    return (
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr>
              <th className="text-left text-neutral-500 font-normal pb-2 pr-4 w-32">Habit</th>
              {weeks.map((w) => (
                <th key={w.label} className="text-neutral-500 font-normal pb-2 px-1 text-center whitespace-nowrap">
                  {w.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {habits.map((h) => (
              <tr key={h.id}>
                <td className="text-neutral-400 py-1.5 pr-4 truncate max-w-[8rem]">
                  {h.emoji} {h.name}
                </td>
                {weeks.map((w) => {
                  const count = w.dates.filter((d) => getCompleted(h.id, d) === true).length;
                  const total = w.dates.length;
                  return (
                    <td key={w.label} className="py-1.5 px-1 text-center">
                      <span
                        className={`inline-flex items-center justify-center w-6 h-5 rounded text-neutral-100 bg-neutral-100 text-[10px] font-medium ${countToOpacity(count, total)}`}
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
            <th className="text-left text-neutral-500 font-normal pb-2 pr-4 w-32">Habit</th>
            {dates.map((d) => (
              <th key={d} className="text-neutral-500 font-normal pb-2 px-1 text-center whitespace-nowrap">
                {formatHeader(d)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {habits.map((h) => (
            <tr key={h.id}>
              <td className="text-neutral-400 py-1.5 pr-4 truncate max-w-[8rem]">
                {h.emoji} {h.name}
              </td>
              {dates.map((d) => {
                const done = getCompleted(h.id, d);
                return (
                  <td key={d} className="py-1.5 px-1 text-center">
                    <button
                      onClick={() => handleCellClick(h.id, d)}
                      className={`inline-block w-4 h-4 rounded-full transition-all hover:ring-1 hover:ring-neutral-500 ${
                        done === true
                          ? "bg-neutral-100"
                          : done === false
                          ? "bg-neutral-800 border border-neutral-700"
                          : "bg-neutral-850 border border-neutral-800 opacity-40"
                      }`}
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
