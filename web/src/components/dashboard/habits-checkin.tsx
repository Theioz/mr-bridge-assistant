"use client";

import { useState } from "react";
import type { HabitLog, HabitRegistry } from "@/lib/types";
import type { HabitStreaks } from "@/lib/streaks";

interface Props {
  registry: Pick<HabitRegistry, "id" | "name" | "emoji">[];
  todayLogs: HabitLog[];
  streaks: HabitStreaks;
  toggleAction: (habitId: string, date: string, completed: boolean) => Promise<void>;
  date: string;
}

export default function HabitsCheckin({ registry, todayLogs, streaks, toggleAction, date }: Props) {
  const [completedMap, setCompletedMap] = useState<Map<string, boolean>>(
    () => new Map(todayLogs.map((l) => [l.habit_id, l.completed]))
  );
  const [pendingSet, setPendingSet] = useState<Set<string>>(() => new Set());

  const completedCount = registry.filter((h) => completedMap.get(h.id)).length;
  const total = registry.length;
  const pct = total > 0 ? Math.round((completedCount / total) * 100) : 0;

  async function handleToggle(habitId: string) {
    if (pendingSet.has(habitId)) return;
    const current = completedMap.get(habitId) ?? false;
    const next = !current;

    setCompletedMap((prev) => new Map(prev).set(habitId, next));
    setPendingSet((prev) => new Set(prev).add(habitId));

    try {
      await toggleAction(habitId, date, next);
    } catch {
      setCompletedMap((prev) => new Map(prev).set(habitId, current));
    } finally {
      setPendingSet((prev) => {
        const s = new Set(prev);
        s.delete(habitId);
        return s;
      });
    }
  }

  return (
    <div className="bg-neutral-900 rounded-xl border border-neutral-800 p-4">
      <p className="text-xs text-neutral-500 uppercase tracking-wide mb-3">Habits today</p>

      {/* Progress header */}
      <div className="flex items-baseline gap-1.5 mb-2">
        <span className="text-2xl font-semibold font-[family-name:var(--font-mono)] text-neutral-100">
          {completedCount}
        </span>
        <span className="text-neutral-500 text-lg font-normal">/ {total}</span>
      </div>
      <div className="h-1 bg-neutral-800 rounded-full overflow-hidden mb-4">
        <div
          className={`h-full rounded-full transition-all duration-300 ${
            pct === 100 ? "bg-green-500" : "bg-blue-500"
          }`}
          style={{ width: `${pct}%` }}
        />
      </div>

      {/* Habit rows */}
      <div className="space-y-0.5">
        {registry.map((habit) => {
          const done = completedMap.get(habit.id) ?? false;
          const isPending = pendingSet.has(habit.id);
          const streak = streaks[habit.id];
          const currentStreak = streak?.current ?? 0;
          const bestStreak = streak?.best ?? 0;

          return (
            <button
              key={habit.id}
              onClick={() => handleToggle(habit.id)}
              disabled={isPending}
              className={`w-full flex items-center gap-2 py-1.5 px-1.5 rounded-lg hover:bg-neutral-800/60 transition-colors text-left ${
                isPending ? "opacity-50" : ""
              }`}
            >
              {/* Checkbox */}
              <span
                className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 transition-colors ${
                  done ? "bg-blue-500 border-blue-500" : "border-neutral-600"
                }`}
              >
                {done && (
                  <svg className="w-2.5 h-2.5 text-white" viewBox="0 0 12 12" fill="none">
                    <path
                      d="M2 6l3 3 5-5"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                )}
              </span>

              {/* Emoji */}
              {habit.emoji && (
                <span className="text-base leading-none flex-shrink-0">{habit.emoji}</span>
              )}

              {/* Name */}
              <span
                className={`text-sm truncate flex-1 min-w-0 transition-colors ${
                  done ? "text-neutral-600 line-through" : "text-neutral-200"
                }`}
              >
                {habit.name}
              </span>

              {/* Streak: current / best */}
              <span className="flex items-baseline gap-0.5 flex-shrink-0 ml-1 font-[family-name:var(--font-mono)]">
                {currentStreak > 0 ? (
                  <span className="text-xs text-amber-400">{currentStreak}</span>
                ) : (
                  <span className="text-xs text-neutral-700">—</span>
                )}
                {bestStreak > 0 && (
                  <span className="text-[10px] text-neutral-600">/{bestStreak}</span>
                )}
              </span>
            </button>
          );
        })}

        {registry.length === 0 && (
          <p className="text-sm text-neutral-600 py-2">No habits configured.</p>
        )}
      </div>

      {/* Legend */}
      {registry.length > 0 && (
        <p className="text-[10px] text-neutral-700 mt-3 text-right">streak / best</p>
      )}
    </div>
  );
}
