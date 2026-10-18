import { Loader2 } from "lucide-react";
import MealTypePills from "./MealTypePills";
import type { MacroTotals, MealType } from "./types";
import { bigButtonSize, ctaStyle, inputStyle, sheetStyle, sheetTitleStyle } from "./styles";

const rowLabelStyle = {
  fontSize: "var(--t-meta)",
  color: "var(--color-text-muted)",
  whiteSpace: "nowrap",
} as const;

export default function MealPrepSheet({
  batchServings,
  onBatchServingsChange,
  containers,
  onContainersChange,
  mealType,
  onMealTypeChange,
  combined,
  prepping,
  onSubmit,
}: {
  batchServings: string;
  onBatchServingsChange: (v: string) => void;
  containers: string;
  onContainersChange: (v: string) => void;
  mealType: MealType;
  onMealTypeChange: (t: MealType) => void;
  combined: MacroTotals;
  prepping: boolean;
  onSubmit: () => void;
}) {
  const n = parseInt(containers) || 1;
  return (
    <div className="flex flex-col" style={sheetStyle}>
      <p style={sheetTitleStyle}>Meal prep</p>

      <div className="flex items-center" style={{ gap: "var(--space-3)" }}>
        <label style={{ ...rowLabelStyle, flex: 1 }}>Total batch makes</label>
        <input
          type="text"
          inputMode="decimal"
          value={batchServings}
          onChange={(e) => onBatchServingsChange(e.target.value)}
          style={{ ...inputStyle, width: 72 }}
        />
        <span style={rowLabelStyle}>servings</span>
      </div>

      <div className="flex items-center" style={{ gap: "var(--space-3)" }}>
        <label style={{ ...rowLabelStyle, flex: 1 }}>Splitting into</label>
        <input
          type="text"
          inputMode="numeric"
          value={containers}
          onChange={(e) => onContainersChange(e.target.value)}
          style={{ ...inputStyle, width: 72 }}
        />
        <span style={rowLabelStyle}>containers</span>
      </div>

      {/* Per-container preview */}
      <div style={{ fontSize: "var(--t-meta)", color: "var(--color-text-muted)" }}>
        Per container:{" "}
        <span className="tnum" style={{ color: "var(--color-text)", fontWeight: 600 }}>
          {Math.round(combined.calories / n)} cal · {Math.round((combined.protein_g / n) * 10) / 10}
          g P · {Math.round((combined.carbs_g / n) * 10) / 10}g C ·{" "}
          {Math.round((combined.fat_g / n) * 10) / 10}g F
        </span>
      </div>

      {/* Meal type */}
      <MealTypePills value={mealType} onChange={onMealTypeChange} />

      <button
        onClick={onSubmit}
        disabled={prepping}
        className="flex items-center justify-center transition-opacity active:opacity-70 disabled:opacity-50"
        style={{
          ...ctaStyle,
          gap: "var(--space-2)",
          ...bigButtonSize,
          cursor: prepping ? "default" : "pointer",
        }}
      >
        {prepping && <Loader2 size={15} className="animate-spin" />}
        Log {n} container{n !== 1 ? "s" : ""}
      </button>
    </div>
  );
}
