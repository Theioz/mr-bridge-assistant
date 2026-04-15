"use client";

import { useState } from "react";
import { CheckSquare } from "lucide-react";
import EmptyState from "./empty-state";
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
    <div
      className="rounded-xl p-4"
      style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)" }}
    >
      <p
        className="text-xs uppercase tracking-widest mb-3"
        style={{ color: "var(--color-text-muted)", letterSpacing: "0.07em" }}
      >
        Habits today
      </p>

      {/* Progress header */}
      <div className="flex items-baseline gap-1.5 mb-2">
        <span
          className="font-heading font-bold tabular-nums"
          style={{ fontSize: 24, color: "var(--color-text)" }}
        >
          {completedCount}
        </span>
        <span style={{ fontSize: 18, color: "var(--color-text-muted)" }}>/ {total}</span>
      </div>
      <div
        className="h-1 rounded-full overflow-hidden mb-4"
        style={{ background: "var(--color-border)" }}
      >
        <div
          className="h-full rounded-full transition-all duration-300"
          style={{
            width: `${pct}%`,
            background: pct === 100 ? "var(--color-positive)" : "var(--color-primary)",
          }}
        />
      </div>

      {/* Habit rows */}
      <div className="space-y-0.5 overflow-y-auto" style={{ maxHeight: 200 }}>
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
              className="w-full flex items-center gap-2 py-1.5 px-1.5 rounded-lg text-left transition-colors"
              style={{
                opacity: isPending ? 0.5 : 1,
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLButtonElement).style.background = "var(--color-surface-raised)";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.background = "transparent";
              }}
            >
              {/* Checkbox */}
              <span
                className="flex items-center justify-center flex-shrink-0 rounded transition-colors"
                style={{
                  width: 16,
                  height: 16,
                  border: done ? "none" : "1px solid var(--color-text-faint)",
                  background: done ? "var(--color-primary)" : "transparent",
                  borderRadius: 4,
                }}
              >
                {done && (
                  <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
                    <path
                      d="M2 6l3 3 5-5"
                      stroke="white"
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
                className="text-sm truncate flex-1 min-w-0 transition-colors"
                style={{
                  color: done ? "var(--color-text-faint)" : "var(--color-text)",
                  textDecoration: done ? "line-through" : "none",
                }}
              >
                {habit.name}
              </span>

              {/* Streak */}
              <span
                className="flex items-baseline gap-0.5 flex-shrink-0 ml-1 tabular-nums"
                style={{ fontSize: 11 }}
              >
                {currentStreak > 0 ? (
                  <span style={{ color: "var(--color-warning)" }}>{currentStreak}</span>
                ) : (
                  <span style={{ color: "var(--color-text-faint)" }}>—</span>
                )}
                {bestStreak > 0 && (
                  <span style={{ color: "var(--color-text-faint)", fontSize: 10 }}>/{bestStreak}</span>
                )}
              </span>
            </button>
          );
        })}

        {registry.length === 0 && (
          <EmptyState
            icon={CheckSquare}
            paddingY={8}
            actionHref="/habits"
            actionLabel="Configure"
          >
            No habits configured
          </EmptyState>
        )}
      </div>

      {/* Legend */}
      {registry.length > 0 && (
        <p className="text-right mt-3" style={{ fontSize: 10, color: "var(--color-text-faint)" }}>
          streak / best
        </p>
      )}
    </div>
  );
}
