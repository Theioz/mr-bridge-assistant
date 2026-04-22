"use client";

import { useState } from "react";
import { CheckSquare } from "lucide-react";
import EmptyState from "./empty-state";
import type { HabitLog, HabitRegistry } from "@/lib/types";
import type { HabitStreaks } from "@/lib/streaks";

interface Props {
  registry: Pick<HabitRegistry, "id" | "name" | "emoji" | "category" | "icon_key">[];
  todayLogs: HabitLog[];
  streaks: HabitStreaks;
  toggleAction: (habitId: string, date: string, completed: boolean) => Promise<void>;
  date: string;
}

export default function HabitsCheckin({ registry, todayLogs, streaks, toggleAction, date }: Props) {
  const [completedMap, setCompletedMap] = useState<Map<string, boolean>>(
    () => new Map(todayLogs.map((l) => [l.habit_id, l.completed])),
  );
  const [pendingSet, setPendingSet] = useState<Set<string>>(() => new Set());

  const completedCount = registry.filter((h) => completedMap.get(h.id)).length;
  const total = registry.length;

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
    <section>
      <h2 className="db-section-label">
        Habits
        {total > 0 && (
          <span className="meta tnum">
            · {completedCount}/{total}
          </span>
        )}
      </h2>

      {registry.length > 0 ? (
        <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
          {registry.map((habit) => {
            const done = completedMap.get(habit.id) ?? false;
            const isPending = pendingSet.has(habit.id);
            const streak = streaks[habit.id];
            const currentStreak = streak?.current ?? 0;

            return (
              <li
                key={habit.id}
                className="db-row"
                style={{
                  gridTemplateColumns: "auto 1fr auto",
                  alignItems: "center",
                  padding: 0,
                }}
              >
                <button
                  onClick={() => handleToggle(habit.id)}
                  disabled={isPending}
                  role="checkbox"
                  aria-checked={done}
                  aria-label={habit.name}
                  className="hover-bg-subtle"
                  style={{
                    display: "grid",
                    gridTemplateColumns: "auto 1fr auto",
                    gap: "var(--space-3)",
                    alignItems: "center",
                    width: "100%",
                    minHeight: 44,
                    padding: "var(--space-3) 0",
                    background: "transparent",
                    border: 0,
                    textAlign: "left",
                    cursor: isPending ? "wait" : "pointer",
                    opacity: isPending ? 0.5 : 1,
                  }}
                >
                  <span
                    aria-hidden
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                      width: 18,
                      height: 18,
                      borderRadius: "var(--r-1)",
                      border: done ? "none" : "1px solid var(--color-text-faint)",
                      background: done ? "var(--accent)" : "transparent",
                      transition:
                        "background var(--motion-fast) var(--ease-out-quart), border-color var(--motion-fast) var(--ease-out-quart)",
                    }}
                  >
                    {done && (
                      <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                        <path
                          d="M2 6l3 3 5-5"
                          stroke="var(--color-text-on-cta)"
                          strokeWidth="1.6"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    )}
                  </span>
                  <span
                    style={{
                      fontSize: "var(--t-body)",
                      color: done ? "var(--color-text-faint)" : "var(--color-text)",
                      textDecoration: done ? "line-through" : "none",
                      minWidth: 0,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {habit.name}
                  </span>
                  <span
                    className="tnum"
                    style={{
                      fontSize: "var(--t-micro)",
                      color:
                        currentStreak > 0 ? "var(--color-text-muted)" : "var(--color-text-faint)",
                      flexShrink: 0,
                    }}
                  >
                    {currentStreak > 0 ? `${currentStreak}d` : "—"}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <EmptyState icon={CheckSquare} paddingY={16} actionHref="/habits" actionLabel="Configure">
          No habits configured
        </EmptyState>
      )}
    </section>
  );
}
