"use client";

interface Props {
  value: "daily" | "weekly";
  onChange: (v: "daily" | "weekly") => void;
  disabled?: boolean;
}

export function GranularityToggle({ value, onChange, disabled }: Props) {
  return (
    <div
      className="flex items-center gap-0.5 p-0.5 rounded-lg"
      style={{
        background: "var(--color-surface)",
        border: "1px solid var(--color-border)",
        opacity: disabled ? 0.45 : 1,
      }}
      title={disabled ? "Switch to a shorter window to view daily data" : undefined}
    >
      {(["daily", "weekly"] as const).map((opt) => {
        const active = opt === value;
        return (
          <button
            key={opt}
            onClick={() => !disabled && onChange(opt)}
            disabled={disabled}
            className="px-2.5 py-1 rounded-md text-xs font-medium transition-all duration-150"
            style={{
              background: active ? "var(--color-primary)" : "transparent",
              color: active ? "#fff" : "var(--color-text-muted)",
              cursor: disabled ? "not-allowed" : "pointer",
            }}
          >
            {opt.charAt(0).toUpperCase() + opt.slice(1)}
          </button>
        );
      })}
    </div>
  );
}
