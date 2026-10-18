import { AlertCircle, Camera, Loader2, RefreshCw } from "lucide-react";
import MacroInput from "./MacroInput";
import type { ScanItem } from "./types";
import { fieldLabelStyle, inputStyle, textareaStyle } from "./styles";

// Soft warning pill — calories diverge >10% from macro-derived total.
function CalorieDriftWarning({ item }: { item: ScanItem }) {
  const derived = item.protein_g * 4 + item.carbs_g * 4 + item.fat_g * 9;
  if (derived <= 0) return null;
  const drift = Math.abs(item.calories - derived) / derived;
  if (drift <= 0.1) return null;
  return (
    <div
      className="flex items-start"
      style={{
        gap: "var(--space-2)",
        padding: "var(--space-2) var(--space-3)",
        borderRadius: "var(--r-2)",
        background: "var(--color-danger-subtle)",
        fontSize: "var(--t-micro)",
        color: "var(--color-text)",
      }}
      role="status"
    >
      <AlertCircle
        size={13}
        style={{ flexShrink: 0, marginTop: 1, color: "var(--color-danger)" }}
      />
      <span>
        Calories don&apos;t match macros — derived {Math.round(derived)} kcal from P
        {Math.round(item.protein_g)} · C{Math.round(item.carbs_g)} · F{Math.round(item.fat_g)}. You
        can log anyway.
      </span>
    </div>
  );
}

const linkButtonBase = {
  gap: "var(--space-1)",
  fontSize: "var(--t-meta)",
  padding: "var(--space-1) 0",
  background: "none",
  border: "none",
  alignSelf: "flex-start",
} as const;

// Expanded editor: editable macros + fiber/sugar + optional ingredients + re-estimate.
export default function ScanItemEditor({
  item,
  onUpdate,
  reestimating,
  rescanning,
  rescanError,
  onReestimate,
  onRescan,
}: {
  item: ScanItem;
  onUpdate: (patch: Partial<ScanItem>) => void;
  reestimating: boolean;
  rescanning: boolean;
  rescanError: string | null;
  onReestimate: () => void;
  onRescan: () => void;
}) {
  const reestimateDisabled = reestimating || !item.ingredients?.trim();
  return (
    <div className="flex flex-col" style={{ marginTop: "var(--space-3)", gap: "var(--space-3)" }}>
      {/* Dish name */}
      <div>
        <label style={fieldLabelStyle}>Dish name</label>
        <input
          type="text"
          value={item.label}
          onChange={(e) => onUpdate({ label: e.target.value, labelManuallyEdited: true })}
          style={{ ...inputStyle, fontWeight: 600, fontSize: "var(--t-body)" }}
        />
      </div>

      {/* Macros grid: calories, protein, carbs, fat */}
      <div className="grid grid-cols-2" style={{ gap: "var(--space-2)" }}>
        <MacroInput
          label="Calories"
          value={item.calories}
          integer
          onChange={(v) => onUpdate({ calories: v ?? 0, caloriesManuallyEdited: true })}
        />
        <MacroInput
          label="Protein (g)"
          value={item.protein_g}
          onChange={(v) => onUpdate({ protein_g: v ?? 0, proteinManuallyEdited: true })}
        />
        <MacroInput
          label="Carbs (g)"
          value={item.carbs_g}
          onChange={(v) => onUpdate({ carbs_g: v ?? 0, carbsManuallyEdited: true })}
        />
        <MacroInput
          label="Fat (g)"
          value={item.fat_g}
          onChange={(v) => onUpdate({ fat_g: v ?? 0, fatManuallyEdited: true })}
        />
        <MacroInput
          label="Fiber (g)"
          value={item.fiber_g}
          nullable
          onChange={(v) => onUpdate({ fiber_g: v, fiberManuallyEdited: true })}
        />
        <MacroInput
          label="Sugar (g)"
          value={item.sugar_g}
          nullable
          onChange={(v) => onUpdate({ sugar_g: v, sugarManuallyEdited: true })}
        />
      </div>

      <CalorieDriftWarning item={item} />

      {/* Ingredients / re-estimate — food-photo mode only */}
      {item.mode === "food" && (
        <div className="flex flex-col" style={{ gap: "var(--space-2)" }}>
          <label
            style={{
              fontSize: "var(--t-micro)",
              color: "var(--color-text-muted)",
              display: "block",
            }}
          >
            Ingredients
          </label>
          <textarea
            value={item.ingredients ?? ""}
            rows={3}
            autoComplete="off"
            autoCorrect="off"
            onChange={(e) => onUpdate({ ingredients: e.target.value })}
            style={textareaStyle}
          />
          <button
            onClick={onReestimate}
            disabled={reestimateDisabled}
            className="flex items-center transition-opacity active:opacity-70 disabled:opacity-40"
            style={{
              ...linkButtonBase,
              color: "var(--accent)",
              cursor: reestimateDisabled ? "default" : "pointer",
            }}
          >
            {reestimating ? (
              <Loader2 size={13} className="animate-spin" />
            ) : (
              <RefreshCw size={13} />
            )}
            Re-estimate macros
          </button>
          <button
            onClick={onRescan}
            disabled={rescanning}
            className="flex items-center transition-opacity active:opacity-70 disabled:opacity-40"
            style={{
              ...linkButtonBase,
              color: "var(--color-text-muted)",
              cursor: rescanning ? "default" : "pointer",
            }}
          >
            {rescanning ? <Loader2 size={13} className="animate-spin" /> : <Camera size={13} />}
            Re-scan with photo
          </button>
          {rescanError !== null && (
            <span
              style={{
                fontSize: "var(--t-micro)",
                color: "var(--color-danger)",
              }}
            >
              {rescanError}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
