"use client";

import type { HabitRegistry } from "@/lib/types";
import type { HabitStreaks } from "@/lib/streaks";

interface Props {
  habits: HabitRegistry[];
  streaks: HabitStreaks;
}

export function LongestChainBadges({ habits, streaks }: Props) {
  const rows = habits
    .map((h) => {
      const s = streaks[h.id] ?? { current: 0, best: 0 };
      return { id: h.id, name: h.name, current: s.current, best: s.best };
    })
    .sort((a, b) => b.current - a.current || a.name.localeCompare(b.name));

  const hasAnyStreak = rows.some((r) => r.current > 0 || r.best > 0);

  if (!hasAnyStreak) {
    return (
      <section>
        <h2 className="db-section-label">Streaks</h2>
        <p style={{ fontSize: "var(--t-body)", color: "var(--color-text-faint)" }}>
          No streaks yet
        </p>
      </section>
    );
  }

  return (
    <section>
      <h2 className="db-section-label">
        Streaks
        <span className="meta">· {habits.length} active</span>
      </h2>

      <div>
        {rows.map((r) => {
          const matchesBest = r.current > 0 && r.current === r.best;
          return (
            <div
              key={r.id}
              className="db-row"
              style={{
                gridTemplateColumns: "1fr auto",
                alignItems: "baseline",
                minHeight: 44,
              }}
            >
              <span
                style={{
                  fontSize: "var(--t-body)",
                  color: "var(--color-text)",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  minWidth: 0,
                }}
              >
                {r.name}
              </span>

              <span
                className="tnum"
                style={{
                  display: "inline-flex",
                  alignItems: "baseline",
                  gap: "var(--space-2)",
                  fontSize: "var(--t-meta)",
                  whiteSpace: "nowrap",
                }}
                aria-label={
                  matchesBest
                    ? `${r.name}: current ${r.current} days, matches personal best`
                    : `${r.name}: current ${r.current} days, best ${r.best} days`
                }
              >
                {matchesBest && (
                  <span
                    aria-hidden
                    style={{
                      display: "inline-block",
                      width: 6,
                      height: 6,
                      borderRadius: "50%",
                      background: "var(--accent)",
                      transform: "translateY(-1px)",
                    }}
                  />
                )}
                <span style={{ color: "var(--color-text)", fontWeight: 500 }}>
                  {r.current}d
                </span>
                <span style={{ color: "var(--color-text-faint)" }}>
                  · best {r.best}d
                </span>
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}
