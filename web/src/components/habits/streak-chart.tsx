"use client";

import type { HabitRegistry } from "@/lib/types";
import type { HabitStreaks } from "@/lib/streaks";

interface Props {
  habits: HabitRegistry[];
  streaks: HabitStreaks;
}

export function StreakChart({ habits, streaks }: Props) {
  const data = habits
    .map((h) => ({
      name: h.name,
      current: streaks[h.id]?.current ?? 0,
      best: streaks[h.id]?.best ?? 0,
    }))
    .sort((a, b) => b.current - a.current);

  if (data.every((d) => d.current === 0 && d.best === 0)) {
    return (
      <section>
        <h2 className="db-section-label">Current Streaks</h2>
        <p style={{ fontSize: "var(--t-body)", color: "var(--color-text-faint)" }}>
          No streak data yet
        </p>
      </section>
    );
  }

  const maxCurrent = Math.max(1, ...data.map((d) => d.current));
  const nonZero = data.filter((d) => d.current > 0);
  const avg =
    nonZero.length > 0
      ? nonZero.reduce((sum, d) => sum + d.current, 0) / nonZero.length
      : 0;
  const avgPct = (avg / maxCurrent) * 100;

  return (
    <section>
      <h2 className="db-section-label">
        Current Streaks
        <span className="meta">· {data.length} habits</span>
      </h2>

      <div>
        {data.map((d) => {
          const pct = (d.current / maxCurrent) * 100;
          return (
            <div
              key={d.name}
              className="db-row"
              style={{
                gridTemplateColumns: "minmax(110px, 1fr) 2fr auto",
                alignItems: "center",
                minHeight: 44,
              }}
            >
              <span
                style={{
                  fontSize: "var(--t-meta)",
                  color: "var(--color-text)",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {d.name}
              </span>

              <div
                role="img"
                aria-label={`${d.name}: current streak ${d.current} days${
                  d.best > d.current ? `, best ${d.best} days` : ""
                }`}
                style={{ position: "relative", height: 20 }}
              >
                {/* Baseline rule at the average, dashed */}
                {avg > 0 && (
                  <div
                    aria-hidden
                    style={{
                      position: "absolute",
                      left: `${avgPct}%`,
                      top: 2,
                      bottom: 2,
                      width: 0,
                      borderLeft: "1px dashed var(--chart-color-baseline)",
                    }}
                  />
                )}
                {/* 1.5px hairline stroke from 0 to current */}
                <div
                  aria-hidden
                  style={{
                    position: "absolute",
                    left: 0,
                    width: `${pct}%`,
                    top: "50%",
                    transform: "translateY(-50%)",
                    height: 1.5,
                    background: "var(--chart-color-primary)",
                    borderRadius: 1,
                  }}
                />
                {/* 6px accent dot marking today's endpoint */}
                {d.current > 0 && (
                  <div
                    aria-hidden
                    style={{
                      position: "absolute",
                      left: `${pct}%`,
                      top: "50%",
                      transform: "translate(-50%, -50%)",
                      width: 6,
                      height: 6,
                      borderRadius: "50%",
                      background: "var(--accent)",
                    }}
                  />
                )}
              </div>

              <span
                className="tnum"
                style={{
                  fontSize: "var(--t-micro)",
                  color: "var(--color-text-muted)",
                  minWidth: 72,
                  textAlign: "right",
                  whiteSpace: "nowrap",
                }}
              >
                <span style={{ color: "var(--color-text)" }}>{d.current}d</span>
                {d.best > d.current && (
                  <span style={{ color: "var(--color-text-faint)" }}> · {d.best}</span>
                )}
              </span>
            </div>
          );
        })}
      </div>

      {avg > 0 && (
        <p
          style={{
            marginTop: "var(--space-3)",
            fontSize: "var(--t-micro)",
            color: "var(--color-text-faint)",
          }}
        >
          dashed · avg {avg.toFixed(1)}d
        </p>
      )}
    </section>
  );
}
