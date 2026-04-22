"use client";

import { useState } from "react";
import { HABIT_ICON_OPTIONS } from "@/lib/habit-icons";

interface Props {
  value: string;
  onChange: (key: string) => void;
}

export default function HabitIconPicker({ value, onChange }: Props) {
  const [hoveredKey, setHoveredKey] = useState<string | null>(null);

  const labelKey = hoveredKey ?? value;
  const labelText = HABIT_ICON_OPTIONS.find((o) => o.key === labelKey)?.label ?? "";

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "var(--space-2)",
      }}
    >
      <div
        className="flex flex-wrap"
        style={{
          gap: "var(--space-1)",
          padding: "var(--space-1)",
          borderRadius: "var(--r-1)",
          border: "1px solid var(--rule)",
          background: "transparent",
        }}
        role="radiogroup"
        aria-label="Habit icon"
      >
        {HABIT_ICON_OPTIONS.map(({ key, icon: Icon, label }) => {
          const selected = value === key;
          return (
            <button
              key={key}
              type="button"
              role="radio"
              aria-checked={selected}
              aria-label={label}
              onClick={() => onChange(key)}
              onMouseEnter={() => setHoveredKey(key)}
              onMouseLeave={() => setHoveredKey((prev) => (prev === key ? null : prev))}
              onFocus={() => setHoveredKey(key)}
              onBlur={() => setHoveredKey((prev) => (prev === key ? null : prev))}
              style={{
                width: 32,
                height: 32,
                borderRadius: "var(--r-1)",
                background: selected ? "var(--accent)" : "transparent",
                color: selected ? "var(--color-text-on-cta)" : "var(--color-text-muted)",
                border: "none",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                transition:
                  "background var(--motion-fast) var(--ease-out-quart), color var(--motion-fast) var(--ease-out-quart)",
              }}
              className={selected ? undefined : "hover-bg-subtle"}
            >
              <Icon className="w-4 h-4" aria-hidden />
            </button>
          );
        })}
      </div>
      <span
        aria-live="polite"
        style={{
          fontSize: "var(--t-micro)",
          letterSpacing: "0.04em",
          color: "var(--color-text-muted)",
          minHeight: "1em",
        }}
      >
        {labelText}
      </span>
    </div>
  );
}
