"use client";

import { useRef, useState } from "react";
import { RefreshCw, Loader2, Trash2, Camera, AlertCircle } from "lucide-react";
import { compressImage } from "@/lib/meal-photo";
import { MEAL_TYPES, ctaStyle, inputStyle, type MealRow } from "./meals-shared";

// ─── Meal row (flat, hairline, tabular macros column) ────────────────────────

export interface MealRowDisplayProps {
  meal: MealRow;
  onClick: () => void;
  onRelog?: () => void;
  onDelete?: () => void;
}

function formatMacroCol(m: MealRow): string | null {
  const hasMacros = m.calories != null || m.protein_g != null;
  if (!hasMacros) return null;
  return [
    m.calories != null ? `${m.calories} cal` : null,
    m.protein_g != null ? `P ${m.protein_g}` : null,
    m.carbs_g != null ? `C ${m.carbs_g}` : null,
    m.fat_g != null ? `F ${m.fat_g}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

// Second line shown under macros in the expanded-row display; legacy rows with
// null fiber/sugar render as "—" (not 0) so users can tell "not tracked" apart
// from "zero" (#304).
function formatNutrientCol(m: MealRow): string | null {
  const hasFiber = m.fiber_g != null;
  const hasSugar = m.sugar_g != null;
  if (!hasFiber && !hasSugar) return null;
  return `Fiber ${hasFiber ? m.fiber_g : "—"}g · Sugar ${hasSugar ? m.sugar_g : "—"}g`;
}

export function MealRowDisplay({ meal, onClick, onRelog, onDelete }: MealRowDisplayProps) {
  const macroStr = formatMacroCol(meal);
  const nutrientStr = formatNutrientCol(meal);
  return (
    <div
      className="flex items-center"
      onClick={onClick}
      style={{
        cursor: "pointer",
        gap: "var(--space-3)",
        minHeight: 44,
        paddingTop: "var(--space-2)",
        paddingBottom: "var(--space-2)",
      }}
    >
      <span
        style={{
          fontSize: "var(--t-micro)",
          fontWeight: 500,
          color: "var(--color-text-muted)",
          textTransform: "capitalize",
          minWidth: 72,
          flexShrink: 0,
          letterSpacing: "0.02em",
        }}
      >
        {meal.meal_type}
      </span>
      <span
        style={{
          flex: 1,
          minWidth: 0,
          fontSize: "var(--t-body)",
          color: "var(--color-text)",
          wordBreak: "break-word",
        }}
      >
        {meal.cooks?.name ?? meal.recipes?.name ?? meal.notes ?? "—"}
      </span>
      {macroStr && (
        <div
          className="flex-shrink-0 hidden sm:flex"
          style={{ flexDirection: "column", minWidth: 220, alignItems: "flex-end" }}
        >
          <span
            className="tnum"
            style={{
              fontSize: "var(--t-micro)",
              color: "var(--color-text-faint)",
            }}
          >
            {macroStr}
          </span>
          {nutrientStr && (
            <span
              className="tnum"
              style={{
                fontSize: "var(--t-micro)",
                color: "var(--color-text-faint)",
                opacity: 0.75,
              }}
            >
              {nutrientStr}
            </span>
          )}
        </div>
      )}
      {onRelog && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onRelog();
          }}
          aria-label="Log again"
          title="Log again"
          className="transition-opacity hover:opacity-70 flex-shrink-0 flex items-center justify-center"
          style={{
            width: 32,
            height: 32,
            color: "var(--color-text-faint)",
            background: "transparent",
            border: "none",
            cursor: "pointer",
          }}
        >
          <RefreshCw size={14} />
        </button>
      )}
      {onDelete && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          aria-label="Delete meal"
          title="Delete meal"
          className="hover-text-danger transition-opacity flex-shrink-0 flex items-center justify-center"
          style={{
            width: 32,
            height: 32,
            color: "var(--color-text-faint)",
            background: "transparent",
            border: "none",
            cursor: "pointer",
          }}
        >
          <Trash2 size={14} />
        </button>
      )}
    </div>
  );
}

export interface MealRowEditFields {
  notes: string;
  meal_type: string;
  calories: string;
  protein_g: string;
  carbs_g: string;
  fat_g: string;
  fiber_g: string;
  sugar_g: string;
}

interface PhotoRescanResult {
  calories: number | null;
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
  fiber_g: number | null;
  sugar_g: number | null;
}

function MealPhotoRescan({ onResult }: { onResult: (r: PhotoRescanResult) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  async function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (inputRef.current) inputRef.current.value = "";
    if (file.type === "image/heic" || file.name.toLowerCase().endsWith(".heic")) {
      setErrorMsg("In your iPhone Camera settings, set format to 'Most Compatible' and try again.");
      return;
    }
    setLoading(true);
    setErrorMsg(null);
    try {
      let imageBlob: Blob;
      try {
        imageBlob = await compressImage(file);
      } catch {
        imageBlob = file;
      }
      const formData = new FormData();
      formData.append("image", imageBlob, "photo.jpg");
      formData.append("mode", "food");
      const res = await fetch("/api/meals/analyze-photo", { method: "POST", body: formData });
      const contentType = res.headers.get("content-type") ?? "";
      if (!contentType.includes("application/json")) throw new Error("Analysis failed");
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error ?? "Analysis failed");
      onResult({
        calories: data.calories ?? null,
        protein_g: data.protein_g ?? null,
        carbs_g: data.carbs_g ?? null,
        fat_g: data.fat_g ?? null,
        fiber_g: data.fiber_g ?? null,
        sugar_g: data.sugar_g ?? null,
      });
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Re-scan failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleChange}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={loading}
        className="flex items-center transition-opacity active:opacity-70 disabled:opacity-40"
        style={{
          gap: "var(--space-1)",
          fontSize: "var(--t-micro)",
          color: "var(--color-text-muted)",
          background: "none",
          border: "none",
          cursor: loading ? "default" : "pointer",
          padding: 0,
        }}
      >
        {loading ? <Loader2 size={12} className="animate-spin" /> : <Camera size={12} />}
        Re-scan from photo
      </button>
      {errorMsg && (
        <div
          className="flex items-start"
          style={{ gap: "var(--space-1)", marginTop: "var(--space-1)" }}
        >
          <AlertCircle
            size={11}
            style={{ color: "var(--color-danger)", flexShrink: 0, marginTop: 1 }}
          />
          <span style={{ fontSize: "var(--t-micro)", color: "var(--color-danger)" }}>
            {errorMsg}
          </span>
        </div>
      )}
    </div>
  );
}

export function MealRowEdit({
  fields,
  saving,
  onChange,
  onSave,
  onCancel,
}: {
  fields: MealRowEditFields;
  saving: boolean;
  onChange: (next: MealRowEditFields) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  return (
    <div
      className="flex flex-col"
      style={{
        gap: "var(--space-2)",
        paddingTop: "var(--space-3)",
        paddingBottom: "var(--space-3)",
      }}
    >
      <div className="flex" style={{ gap: "var(--space-2)" }}>
        <select
          aria-label="Meal type"
          value={fields.meal_type}
          onChange={(e) => onChange({ ...fields, meal_type: e.target.value })}
          style={{ ...inputStyle, width: "auto", minWidth: 110, flexShrink: 0 }}
        >
          {MEAL_TYPES.map((t) => (
            <option key={t} value={t}>
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </option>
          ))}
        </select>
        <input
          type="text"
          value={fields.notes}
          onChange={(e) => onChange({ ...fields, notes: e.target.value })}
          placeholder="Food name"
          style={{ ...inputStyle, flex: 1 }}
        />
      </div>
      <div className="flex" style={{ gap: "var(--space-2)" }}>
        {(["calories", "protein_g", "carbs_g", "fat_g"] as const).map((field) => (
          <input
            key={field}
            type="number"
            value={fields[field]}
            onChange={(e) => onChange({ ...fields, [field]: e.target.value })}
            placeholder={
              { calories: "Cal", protein_g: "P(g)", carbs_g: "C(g)", fat_g: "F(g)" }[field]
            }
            style={{ ...inputStyle, width: 72 }}
          />
        ))}
      </div>
      <div className="flex" style={{ gap: "var(--space-2)" }}>
        <input
          type="number"
          value={fields.fiber_g}
          onChange={(e) => onChange({ ...fields, fiber_g: e.target.value })}
          placeholder="Fiber(g)"
          style={{ ...inputStyle, width: 96 }}
        />
        <input
          type="number"
          value={fields.sugar_g}
          onChange={(e) => onChange({ ...fields, sugar_g: e.target.value })}
          placeholder="Sugar(g)"
          style={{ ...inputStyle, width: 96 }}
        />
      </div>
      <div className="flex items-center justify-between" style={{ gap: "var(--space-2)" }}>
        <div className="flex" style={{ gap: "var(--space-2)" }}>
          <button
            onClick={onSave}
            disabled={saving}
            style={{
              ...ctaStyle,
              fontSize: "var(--t-micro)",
              padding: "var(--space-1) var(--space-3)",
              opacity: saving ? 0.5 : 1,
            }}
          >
            {saving ? "Saving…" : "Save"}
          </button>
          <button
            onClick={onCancel}
            style={{
              fontSize: "var(--t-micro)",
              padding: "var(--space-1) var(--space-3)",
              color: "var(--color-text-muted)",
              background: "none",
              border: "none",
              cursor: "pointer",
            }}
          >
            Cancel
          </button>
        </div>
        <MealPhotoRescan
          onResult={(r) =>
            onChange({
              ...fields,
              calories: r.calories != null ? String(r.calories) : fields.calories,
              protein_g: r.protein_g != null ? String(r.protein_g) : fields.protein_g,
              carbs_g: r.carbs_g != null ? String(r.carbs_g) : fields.carbs_g,
              fat_g: r.fat_g != null ? String(r.fat_g) : fields.fat_g,
              fiber_g: r.fiber_g != null ? String(r.fiber_g) : fields.fiber_g,
              sugar_g: r.sugar_g != null ? String(r.sugar_g) : fields.sugar_g,
            })
          }
        />
      </div>
    </div>
  );
}
