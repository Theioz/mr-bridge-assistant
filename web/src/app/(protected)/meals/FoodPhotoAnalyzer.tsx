"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, Loader2, X, CheckCircle, AlertCircle, RefreshCw, ChevronDown, ChevronUp } from "lucide-react";
import type { FoodAnalysis } from "@/app/api/meals/analyze-photo/route";

type MealType = "breakfast" | "lunch" | "dinner" | "snack";
type Phase = "idle" | "loading" | "review" | "saving" | "done" | "error";

interface ReviewState extends FoodAnalysis {
  meal_type_guess: MealType;
}

const CONFIDENCE_COLORS: Record<string, string> = {
  high: "var(--color-success, #22c55e)",
  medium: "var(--color-warning, #f59e0b)",
  low: "var(--color-danger, #ef4444)",
};

const inputStyle = {
  background: "var(--color-bg)",
  border: "1px solid var(--color-border)",
  color: "var(--color-text)",
  outline: "none",
  fontSize: 16, // Prevents iOS auto-zoom on focus
  borderRadius: 8,
  padding: "10px 12px",
  width: "100%",
  WebkitAppearance: "none" as const,
} as const;

export default function FoodPhotoAnalyzer() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string>("");
  const [review, setReview] = useState<ReviewState | null>(null);
  const [reestimating, setReestimating] = useState(false);
  const [macrosExpanded, setMacrosExpanded] = useState(false);
  const [userPrompt, setUserPrompt] = useState<string>("");

  function reset() {
    setPhase("idle");
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
    }
    setReview(null);
    setErrorMsg("");
    setReestimating(false);
    setMacrosExpanded(false);
    setUserPrompt("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    setPhase("loading");

    const formData = new FormData();
    formData.append("image", file);
    if (userPrompt.trim()) formData.append("prompt", userPrompt.trim());

    try {
      const res = await fetch("/api/meals/analyze-photo", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error ?? "Analysis failed");
      setReview(data as ReviewState);
      setPhase("review");
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Analysis failed");
      setPhase("error");
    }
  }

  async function handleReestimate() {
    if (!review) return;
    setReestimating(true);
    try {
      const res = await fetch("/api/meals/estimate-macros", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ingredients: review.ingredients }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error ?? "Re-estimation failed");
      // Merge updated macros back, keep meal_type_guess from user's current selection
      setReview((prev) =>
        prev ? { ...data, meal_type_guess: prev.meal_type_guess } : data
      );
    } catch (err) {
      // Surface re-estimation errors inline without blowing away the review state
      setErrorMsg(err instanceof Error ? err.message : "Re-estimation failed");
    } finally {
      setReestimating(false);
    }
  }

  async function handleLog() {
    if (!review) return;
    setPhase("saving");

    try {
      const res = await fetch("/api/meals/log", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          meal_type: review.meal_type_guess,
          notes: `${review.food_name} — ${review.ingredients}`,
          calories: review.calories,
          protein_g: review.protein_g,
          carbs_g: review.carbs_g,
          fat_g: review.fat_g,
          fiber_g: review.fiber_g,
          sodium_mg: review.sodium_mg,
          source: "vision",
        }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error ?? "Failed to log meal");
      setPhase("done");
      router.refresh();
      setTimeout(reset, 2000);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to log meal");
      setPhase("error");
    }
  }

  function updateMacro(field: keyof ReviewState, value: string, isInt: boolean) {
    const parsed = isInt ? parseInt(value, 10) : parseFloat(value);
    if (!isNaN(parsed)) setReview((prev) => (prev ? { ...prev, [field]: parsed } : prev));
    else if (value === "") setReview((prev) => (prev ? { ...prev, [field]: 0 } : prev));
  }

  return (
    <div
      className="rounded-xl p-5"
      style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)" }}
    >
      <p
        className="text-xs uppercase tracking-widest mb-4"
        style={{ color: "var(--color-text-muted)", letterSpacing: "0.07em" }}
      >
        Analyze Food Photo
      </p>

      {/* IDLE */}
      {phase === "idle" && (
        <div className="flex flex-col gap-3">
          <div>
            <label style={{ fontSize: 12, color: "var(--color-text-muted)", display: "block", marginBottom: 6 }}>
              Context <span style={{ color: "var(--color-text-faint)" }}>(optional)</span>
            </label>
            <textarea
              value={userPrompt}
              onChange={(e) => setUserPrompt(e.target.value)}
              rows={2}
              placeholder="e.g. This is a homemade bowl with ~200g chicken breast and half-cup rice"
              autoComplete="off"
              autoCorrect="off"
              style={{
                ...inputStyle,
                resize: "none",
                lineHeight: 1.6,
              }}
            />
          </div>
          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center justify-center gap-2 rounded-xl font-medium transition-opacity active:opacity-70"
            style={{
              background: "var(--color-primary)",
              color: "#fff",
              fontSize: 16,
              padding: "13px 20px",
              width: "100%",
              minHeight: 48,
            }}
          >
            <Camera size={18} />
            Upload or take photo
          </button>
          <p style={{ fontSize: 12, color: "var(--color-text-faint)" }}>
            Claude identifies the food and estimates macros. Images are never stored.
          </p>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleFileChange}
          />
        </div>
      )}

      {/* LOADING */}
      {phase === "loading" && (
        <div className="flex items-center gap-4">
          {previewUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={previewUrl}
              alt="Food preview"
              className="rounded-lg object-cover flex-shrink-0"
              style={{ width: 64, height: 64 }}
            />
          )}
          <div className="flex items-center gap-2" style={{ color: "var(--color-text-muted)" }}>
            <Loader2 size={16} className="animate-spin" style={{ color: "var(--color-primary)" }} />
            <span style={{ fontSize: 15 }}>Analyzing…</span>
          </div>
        </div>
      )}

      {/* REVIEW */}
      {phase === "review" && review && (
        <div className="space-y-5">
          {/* Thumbnail row */}
          {previewUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={previewUrl}
              alt="Food preview"
              className="rounded-lg object-cover w-full"
              style={{ maxHeight: 180, objectFit: "cover" }}
            />
          )}

          {/* ── Food name (display label) ── */}
          <div>
            <p style={{ fontSize: 16, fontWeight: 600, color: "var(--color-text)" }}>
              {review.food_name}
            </p>
          </div>

          {/* ── Ingredients (primary edit target) ── */}
          <div>
            <label style={{ fontSize: 12, color: "var(--color-text-muted)", display: "block", marginBottom: 6 }}>
              Ingredients
            </label>
            <textarea
              value={review.ingredients}
              onChange={(e) => setReview((prev) => prev ? { ...prev, ingredients: e.target.value } : prev)}
              rows={3}
              placeholder="e.g. chicken breast ~150g, white rice ~1 cup, broccoli ~½ cup"
              autoComplete="off"
              autoCorrect="off"
              style={{
                ...inputStyle,
                resize: "none",
                lineHeight: 1.6,
              }}
            />
            <div className="flex items-center gap-3 mt-2">
              <button
                onClick={handleReestimate}
                disabled={reestimating}
                className="flex items-center gap-1.5 rounded-lg transition-opacity active:opacity-70 disabled:opacity-40"
                style={{
                  fontSize: 13,
                  color: "var(--color-primary)",
                  padding: "6px 0",
                  background: "none",
                  border: "none",
                  cursor: reestimating ? "default" : "pointer",
                }}
              >
                {reestimating
                  ? <Loader2 size={13} className="animate-spin" />
                  : <RefreshCw size={13} />
                }
                Re-estimate macros
              </button>
              {review.confidence && (
                <span
                  className="rounded-full px-2 py-0.5 text-xs font-medium ml-auto"
                  style={{
                    background: CONFIDENCE_COLORS[review.confidence] + "22",
                    color: CONFIDENCE_COLORS[review.confidence],
                  }}
                >
                  {review.confidence} confidence
                </span>
              )}
            </div>
            {review.notes && (
              <p style={{ fontSize: 12, color: "var(--color-text-faint)", marginTop: 6, fontStyle: "italic" }}>
                {review.notes}
              </p>
            )}
          </div>

          {/* Meal type */}
          <div>
            <label style={{ fontSize: 12, color: "var(--color-text-muted)", display: "block", marginBottom: 6 }}>
              Meal type
            </label>
            <select
              value={review.meal_type_guess}
              onChange={(e) =>
                setReview((prev) => prev ? { ...prev, meal_type_guess: e.target.value as MealType } : prev)
              }
              style={inputStyle}
            >
              <option value="breakfast">Breakfast</option>
              <option value="lunch">Lunch</option>
              <option value="dinner">Dinner</option>
              <option value="snack">Snack</option>
            </select>
          </div>

          {/* ── Macro summary (read-only) with optional manual edit toggle ── */}
          <div
            className="rounded-lg p-3"
            style={{ background: "var(--color-bg)", border: "1px solid var(--color-border)" }}
          >
            {/* Read-only summary row */}
            <div className="flex items-center justify-between">
              <div className="flex flex-wrap gap-x-4 gap-y-1">
                {[
                  { label: "cal", value: review.calories },
                  { label: "P", value: review.protein_g != null ? `${review.protein_g}g` : null },
                  { label: "C", value: review.carbs_g != null ? `${review.carbs_g}g` : null },
                  { label: "F", value: review.fat_g != null ? `${review.fat_g}g` : null },
                ].map(({ label, value }) =>
                  value != null ? (
                    <span key={label} style={{ fontSize: 14, color: "var(--color-text)" }}>
                      <span style={{ color: "var(--color-text-muted)", fontSize: 12 }}>{label} </span>
                      {value}
                    </span>
                  ) : null
                )}
              </div>
              <button
                onClick={() => setMacrosExpanded((v) => !v)}
                className="flex items-center gap-1 rounded transition-opacity active:opacity-70 ml-3 flex-shrink-0"
                style={{ fontSize: 12, color: "var(--color-text-muted)", background: "none", border: "none" }}
              >
                Edit
                {macrosExpanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
              </button>
            </div>

            {/* Expandable manual edit grid */}
            {macrosExpanded && (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-4">
                {(
                  [
                    { label: "Calories", field: "calories", unit: "kcal", isInt: true },
                    { label: "Protein", field: "protein_g", unit: "g" },
                    { label: "Carbs", field: "carbs_g", unit: "g" },
                    { label: "Fat", field: "fat_g", unit: "g" },
                    { label: "Fiber", field: "fiber_g", unit: "g" },
                    { label: "Sodium", field: "sodium_mg", unit: "mg", isInt: true },
                  ] as { label: string; field: keyof ReviewState; unit: string; isInt?: boolean }[]
                ).map(({ label, field, unit, isInt }) => (
                  <div key={field}>
                    <label style={{ fontSize: 11, color: "var(--color-text-muted)", display: "block", marginBottom: 4 }}>
                      {label} <span style={{ color: "var(--color-text-faint)" }}>({unit})</span>
                    </label>
                    <input
                      type="text"
                      inputMode={isInt ? "numeric" : "decimal"}
                      value={review[field] as number ?? ""}
                      onChange={(e) => updateMacro(field, e.target.value, isInt ?? false)}
                      style={inputStyle}
                    />
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Inline re-estimation error */}
          {errorMsg && phase === "review" && (
            <div className="flex items-center gap-2" style={{ color: "var(--color-danger, #ef4444)", fontSize: 13 }}>
              <AlertCircle size={14} />
              {errorMsg}
              <button
                onClick={() => setErrorMsg("")}
                style={{ marginLeft: "auto", background: "none", border: "none", cursor: "pointer", color: "inherit" }}
              >
                <X size={13} />
              </button>
            </div>
          )}

          {/* Actions */}
          <div className="flex flex-col sm:flex-row gap-2 pt-1">
            <button
              onClick={handleLog}
              className="flex items-center justify-center gap-2 rounded-xl font-medium transition-opacity active:opacity-70"
              style={{
                background: "var(--color-primary)",
                color: "#fff",
                fontSize: 16,
                padding: "13px 20px",
                minHeight: 48,
                flex: 1,
              }}
            >
              Log Meal
            </button>
            <button
              onClick={reset}
              className="flex items-center justify-center gap-2 rounded-xl transition-opacity active:opacity-70"
              style={{
                border: "1px solid var(--color-border)",
                color: "var(--color-text-muted)",
                fontSize: 15,
                padding: "13px 20px",
                minHeight: 48,
              }}
            >
              <X size={15} />
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* SAVING */}
      {phase === "saving" && (
        <div className="flex items-center gap-3" style={{ color: "var(--color-text-muted)" }}>
          <Loader2 size={16} className="animate-spin" style={{ color: "var(--color-primary)" }} />
          <span style={{ fontSize: 15 }}>Logging meal…</span>
        </div>
      )}

      {/* DONE */}
      {phase === "done" && (
        <div className="flex items-center gap-2" style={{ color: "var(--color-success, #22c55e)" }}>
          <CheckCircle size={18} />
          <span style={{ fontSize: 15 }}>Meal logged.</span>
        </div>
      )}

      {/* ERROR (fatal — photo upload failed) */}
      {phase === "error" && (
        <div className="space-y-4">
          <div className="flex items-start gap-2" style={{ color: "var(--color-danger, #ef4444)" }}>
            <AlertCircle size={16} style={{ flexShrink: 0, marginTop: 2 }} />
            <span style={{ fontSize: 14 }}>{errorMsg}</span>
          </div>
          <button
            onClick={reset}
            className="flex items-center justify-center rounded-xl transition-opacity active:opacity-70"
            style={{
              border: "1px solid var(--color-border)",
              color: "var(--color-text-muted)",
              fontSize: 15,
              padding: "13px 20px",
              minHeight: 48,
              width: "100%",
            }}
          >
            Try again
          </button>
        </div>
      )}
    </div>
  );
}
