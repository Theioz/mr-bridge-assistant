"use client";

import type { HabitRegistry, HabitLog } from "@/lib/types";

interface Props {
  habits: HabitRegistry[];
  weekLogs: HabitLog[];
}

const SIZE = 140;
const STROKE = 4;

export function RadialCompletion({ habits, weekLogs }: Props) {
  if (habits.length === 0) {
    return (
      <section>
        <h2 className="db-section-label">Weekly Completion</h2>
        <p style={{ fontSize: "var(--t-body)", color: "var(--color-text-faint)" }}>No habits</p>
      </section>
    );
  }

  const completedByHabit = new Map<string, number>();
  for (const log of weekLogs) {
    if (!log.completed) continue;
    completedByHabit.set(log.habit_id, (completedByHabit.get(log.habit_id) ?? 0) + 1);
  }

  const perHabit = habits
    .map((h) => ({
      name: h.name,
      days: completedByHabit.get(h.id) ?? 0,
    }))
    .sort((a, b) => b.days - a.days);

  const totalPossible = habits.length * 7;
  const totalCompleted = perHabit.reduce((s, h) => s + h.days, 0);
  const pct = totalPossible > 0 ? Math.round((totalCompleted / totalPossible) * 100) : 0;

  const radius = (SIZE - STROKE) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - pct / 100);
  const cx = SIZE / 2;

  return (
    <section>
      <h2 className="db-section-label">
        Weekly Completion
        <span className="meta">· 7d</span>
      </h2>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: "var(--space-5)",
        }}
      >
        <div style={{ position: "relative", width: SIZE, height: SIZE }}>
          <svg
            width={SIZE}
            height={SIZE}
            viewBox={`0 0 ${SIZE} ${SIZE}`}
            role="img"
            aria-label={`${pct}% weekly completion`}
          >
            <circle
              cx={cx}
              cy={cx}
              r={radius}
              fill="none"
              stroke="var(--rule)"
              strokeWidth={STROKE}
            />
            {pct > 0 && (
              <circle
                cx={cx}
                cy={cx}
                r={radius}
                fill="none"
                stroke="var(--accent)"
                strokeWidth={STROKE}
                strokeDasharray={circumference}
                strokeDashoffset={offset}
                strokeLinecap="round"
                transform={`rotate(-90 ${cx} ${cx})`}
                style={{
                  transition:
                    "stroke-dashoffset var(--motion-slow) var(--ease-out-quart)",
                }}
              />
            )}
          </svg>
          <div
            className="tnum"
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              lineHeight: 1,
            }}
          >
            <span
              className="font-heading"
              style={{
                fontSize: "var(--t-h1)",
                fontWeight: 600,
                color: "var(--color-text)",
              }}
            >
              {pct}
              <span style={{ fontSize: "var(--t-meta)", color: "var(--color-text-muted)" }}>%</span>
            </span>
            <span
              style={{
                fontSize: "var(--t-micro)",
                color: "var(--color-text-faint)",
                marginTop: "var(--space-2)",
                letterSpacing: "0.04em",
              }}
            >
              {totalCompleted}/{totalPossible}
            </span>
          </div>
        </div>

        <ul style={{ listStyle: "none", margin: 0, padding: 0, width: "100%" }}>
          {perHabit.map((h) => (
            <li
              key={h.name}
              className="db-row tnum"
              style={{
                gridTemplateColumns: "1fr auto",
                padding: "var(--space-2) 0",
                alignItems: "baseline",
              }}
            >
              <span
                style={{
                  fontSize: "var(--t-micro)",
                  color: "var(--color-text-muted)",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {h.name}
              </span>
              <span
                style={{
                  fontSize: "var(--t-micro)",
                  color: h.days === 7 ? "var(--color-text)" : "var(--color-text-muted)",
                }}
              >
                {h.days}<span style={{ color: "var(--color-text-faint)" }}>/7</span>
              </span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
