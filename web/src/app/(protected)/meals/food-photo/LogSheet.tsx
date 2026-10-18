import { Loader2 } from "lucide-react";
import MealTypePills from "./MealTypePills";
import type { MacroTotals, MealType } from "./types";
import { bigButtonSize, ctaStyle, inputStyle, sheetStyle, sheetTitleStyle } from "./styles";

export default function LogSheet({
  mealType,
  onMealTypeChange,
  servings,
  onServingsChange,
  combined,
  logging,
  onLog,
}: {
  mealType: MealType;
  onMealTypeChange: (t: MealType) => void;
  servings: string;
  onServingsChange: (v: string) => void;
  combined: MacroTotals;
  logging: boolean;
  onLog: () => void;
}) {
  const s = parseFloat(servings) || 1;
  return (
    <div className="flex flex-col" style={sheetStyle}>
      <p style={sheetTitleStyle}>Log as meal</p>

      {/* Meal type */}
      <MealTypePills value={mealType} onChange={onMealTypeChange} />

      {/* Servings */}
      <div className="flex items-center" style={{ gap: "var(--space-3)" }}>
        <label
          style={{
            fontSize: "var(--t-meta)",
            color: "var(--color-text-muted)",
            whiteSpace: "nowrap",
          }}
        >
          Servings
        </label>
        <input
          type="text"
          inputMode="decimal"
          value={servings}
          onChange={(e) => onServingsChange(e.target.value)}
          style={{ ...inputStyle, width: 80 }}
        />
      </div>

      {/* Preview */}
      <div className="tnum" style={{ fontSize: "var(--t-meta)", color: "var(--color-text-muted)" }}>
        <span style={{ color: "var(--color-text)", fontWeight: 600 }}>
          {Math.round(combined.calories * s)} cal · {Math.round(combined.protein_g * s * 10) / 10}g
          P · {Math.round(combined.carbs_g * s * 10) / 10}g C ·{" "}
          {Math.round(combined.fat_g * s * 10) / 10}g F
        </span>
      </div>

      <button
        onClick={onLog}
        disabled={logging}
        className="flex items-center justify-center transition-opacity active:opacity-70 disabled:opacity-50"
        style={{
          ...ctaStyle,
          gap: "var(--space-2)",
          ...bigButtonSize,
          cursor: logging ? "default" : "pointer",
        }}
      >
        {logging && <Loader2 size={15} className="animate-spin" />}
        Log {mealType}
      </button>
    </div>
  );
}
