import type { AnalyzerMode } from "./types";

export default function ModeToggle({
  mode,
  onChange,
}: {
  mode: AnalyzerMode;
  onChange: (m: AnalyzerMode) => void;
}) {
  return (
    <div
      className="flex items-center self-start"
      style={{
        gap: 2,
        padding: 2,
        borderRadius: "var(--r-2)",
        border: "1px solid var(--rule)",
        background: "transparent",
      }}
    >
      {(["food", "label"] as AnalyzerMode[]).map((opt) => {
        const active = opt === mode;
        return (
          <button
            key={opt}
            onClick={() => onChange(opt)}
            style={{
              padding: "var(--space-1) var(--space-3)",
              borderRadius: "var(--r-1)",
              fontSize: "var(--t-micro)",
              fontWeight: 500,
              background: active ? "var(--accent)" : "transparent",
              color: active ? "var(--color-text-on-cta)" : "var(--color-text-muted)",
              border: "none",
              cursor: "pointer",
              whiteSpace: "nowrap",
              transition:
                "background-color var(--motion-fast) var(--ease-out-quart), color var(--motion-fast) var(--ease-out-quart)",
            }}
          >
            {opt === "food" ? "Food Photo" : "Nutrition Label"}
          </button>
        );
      })}
    </div>
  );
}
