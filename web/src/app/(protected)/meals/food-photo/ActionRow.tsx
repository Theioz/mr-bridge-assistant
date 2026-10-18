import { Trash2 } from "lucide-react";
import type { ActiveSheet } from "./types";

function sheetToggleStyle(active: boolean) {
  return {
    background: active ? "var(--accent)" : "transparent",
    color: active ? "var(--color-text-on-cta)" : "var(--color-text)",
    border: "1px solid var(--rule)",
    borderRadius: "var(--r-2)",
    fontSize: "var(--t-meta)",
    fontWeight: 500,
    padding: "var(--space-2) var(--space-4)",
    cursor: "pointer",
    flex: 1,
  } as const;
}

// Log as meal / Meal prep sheet toggles + clear-all.
export default function ActionRow({
  activeSheet,
  onToggleSheet,
  onClearAll,
}: {
  activeSheet: ActiveSheet;
  onToggleSheet: (sheet: "log" | "mealprep") => void;
  onClearAll: () => void;
}) {
  return (
    <div className="flex" style={{ gap: "var(--space-2)" }}>
      <button
        onClick={() => onToggleSheet("log")}
        className="transition-opacity active:opacity-70"
        style={sheetToggleStyle(activeSheet === "log")}
      >
        Log as meal
      </button>
      <button
        onClick={() => onToggleSheet("mealprep")}
        className="transition-opacity active:opacity-70"
        style={sheetToggleStyle(activeSheet === "mealprep")}
      >
        Meal prep
      </button>
      <button
        onClick={onClearAll}
        className="flex items-center justify-center transition-opacity active:opacity-70"
        style={{
          border: "1px solid var(--rule)",
          borderRadius: "var(--r-2)",
          color: "var(--color-text-muted)",
          padding: "var(--space-2) var(--space-3)",
          background: "transparent",
          cursor: "pointer",
        }}
        title="Clear all"
      >
        <Trash2 size={15} />
      </button>
    </div>
  );
}
