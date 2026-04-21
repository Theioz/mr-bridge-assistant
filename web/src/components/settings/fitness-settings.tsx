"use client";

import { useTransition } from "react";

interface Props {
  restTimerEnabled: boolean;
  updateAction: (key: string, value: string) => Promise<void>;
}

export function FitnessSettings({ restTimerEnabled, updateAction }: Props) {
  const [, startTransition] = useTransition();

  function handleToggle() {
    const next = restTimerEnabled ? "0" : "1";
    startTransition(() => {
      updateAction("rest_timer_enabled", next);
    });
  }

  return (
    <section
      aria-labelledby="fitness-heading"
      style={{
        paddingTop: "var(--space-6)",
        paddingBottom: "var(--space-6)",
        borderBottom: "1px solid var(--rule-soft)",
      }}
    >
      <h2 id="fitness-heading" className="db-section-label">
        Fitness
      </h2>

      <div className="flex items-center" style={{ gap: "var(--space-4)" }}>
        <div
          className="flex items-center p-0.5"
          style={{
            background: "transparent",
            border: "1px solid var(--rule)",
            borderRadius: "var(--r-1)",
            gap: 2,
          }}
          role="radiogroup"
          aria-label="Rest timer"
        >
          {(["On", "Off"] as const).map((label) => {
            const selected = label === "On" ? restTimerEnabled : !restTimerEnabled;
            return (
              <button
                key={label}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={handleToggle}
                style={{
                  fontFamily: "var(--font-body), system-ui, sans-serif",
                  fontSize: "var(--t-micro)",
                  fontWeight: 500,
                  letterSpacing: "0.02em",
                  padding: "0 var(--space-3)",
                  minHeight: 44,
                  minWidth: 48,
                  background: selected ? "var(--accent)" : "transparent",
                  color: selected ? "var(--color-text-on-cta)" : "var(--color-text-muted)",
                  border: "none",
                  borderRadius: "var(--r-1)",
                  cursor: "pointer",
                  transition:
                    "background var(--motion-fast) var(--ease-out-quart), color var(--motion-fast) var(--ease-out-quart)",
                }}
              >
                {label}
              </button>
            );
          })}
        </div>

        <span
          style={{
            fontSize: "var(--t-micro)",
            color: "var(--color-text-faint)",
          }}
        >
          {restTimerEnabled
            ? "Auto-starts after each logged set"
            : "Rest timer disabled"}
        </span>
      </div>
    </section>
  );
}
