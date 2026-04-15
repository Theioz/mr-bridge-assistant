"use client";

import { HABIT_ICON_OPTIONS } from "@/lib/habit-icons";

interface Props {
  value: string;
  onChange: (key: string) => void;
}

export default function HabitIconPicker({ value, onChange }: Props) {
  return (
    <div
      className="flex flex-wrap gap-1 p-1.5 rounded"
      style={{ background: "var(--color-surface-raised)", border: "1px solid var(--color-border)" }}
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
            title={label}
            onClick={() => onChange(key)}
            className="w-7 h-7 rounded flex items-center justify-center transition-colors cursor-pointer"
            style={{
              background: selected ? "var(--color-primary)" : "transparent",
              color: selected ? "var(--color-text-on-cta)" : "var(--color-text-muted)",
              border: selected ? "none" : "1px solid transparent",
            }}
          >
            <Icon className="w-4 h-4" aria-hidden />
          </button>
        );
      })}
    </div>
  );
}
