"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, Loader2, X, CheckCircle, AlertCircle, RefreshCw, ChevronDown, ChevronUp } from "lucide-react";
import type { FoodAnalysis, NutritionLabel } from "@/app/api/meals/analyze-photo/route";
import type { TodayTotals } from "@/app/api/meals/today-totals/route";

type AnalyzerMode = "food" | "label";
type MealType = "breakfast" | "lunch" | "dinner" | "snack";
type Phase = "idle" | "loading" | "review" | "saving" | "done" | "error";

interface FoodReviewState extends FoodAnalysis {
  mode: "food";
  meal_type_guess: MealType;
}

interface LabelReviewState extends NutritionLabel {
  mode: "label";
}

type ReviewState = FoodReviewState | LabelReviewState;

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
  fontSize: 16,
  borderRadius: 8,
  padding: "10px 12px",
  width: "100%",
  WebkitAppearance: "none" as const,
} as const;

function MacroFitRow({ totals, addingCalories }: { totals: TodayTotals; addingCalories: number }) {
  return (
    <div
      className="rounded-lg px-3 py-2"
      style={{
        background: "var(--color-bg)",
        border: "1px solid var(--color-border)",
        fontSize: 12,
        color: "var(--color-text-muted)",
      }}
    >
      <span style={{ color: "var(--color-text-faint)" }}>Today so far: </span>
      <span>{Math.round(totals.calories)} cal · Prot {Math.round(totals.protein_g)}g · Carbs {Math.round(totals.carbs_g)}g · Fat {Math.round(totals.fat_g)}g</span>
      <span style={{ color: "var(--color-text-faint)" }}> — this adds </span>
      <span style={{ color: "var(--color-text)" }}>{Math.round(addingCalories)} cal</span>
    </div>
  );
}

export default function FoodPhotoAnalyzer() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [analyzerMode, setAnalyzerMode] = useState<AnalyzerMode>("food");
  const [phase, setPhase] = useState<Phase>("idle");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string>("");
  const [review, setReview] = useState<ReviewState | null>(null);
  const [reestimating, setReestimating] = useState(false);
  const [macrosExpanded, setMacrosExpanded] = useState(false);
  const [userPrompt, setUserPrompt] = useState<string>("");
  const [servingMultiplier, setServingMultiplier] = useState<number>(1.0);
  const [todayTotals, setTodayTotals] = useState<TodayTotals | null>(null);

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
    setServingMultiplier(1.0);
    setTodayTotals(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function fetchTodayTotals() {
    try {
      const res = await fetch("/api/meals/today-totals");
      if (res.ok) {
        const data = await res.json();
        setTodayTotals(data as TodayTotals);
      }
    } catch {
      // non-fatal — daily context is best-effort
    }
  }

  async function compressImage(file: File): Promise<Blob> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const objectUrl = URL.createObjectURL(file);
      img.onload = () => {
        URL.revokeObjectURL(objectUrl);
        const MAX_EDGE = 1920;
        let { width, height } = img;
        if (width > MAX_EDGE || height > MAX_EDGE) {
          if (width >= height) {
            height = Math.round((height * MAX_EDGE) / width);
            width = MAX_EDGE;
          } else {
            width = Math.round((width * MAX_EDGE) / height);
            height = MAX_EDGE;
          }
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) return reject(new Error("Canvas unavailable"));
        ctx.drawImage(img, 0, 0, width, height);
        canvas.toBlob(
          (blob) => {
            if (blob) resolve(blob);
            else reject(new Error("Compression failed"));
          },
          "image/jpeg",
          0.85
        );
      };
      img.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        reject(new Error("Failed to load image for compression"));
      };
      img.src = objectUrl;
    });
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (
      file.type === "image/heic" ||
      file.name.toLowerCase().endsWith(".heic")
    ) {
      setErrorMsg(
        "In your iPhone Camera settings, set format to 'Most Compatible' and try again."
      );
      setPhase("error");
      return;
    }

    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    setPhase("loading");

    let imageBlob: Blob;
    try {
      imageBlob = await compressImage(file);
    } catch {
      imageBlob = file;
    }

    const formData = new FormData();
    formData.append("image", imageBlob, "photo.jpg");
    formData.append("mode", analyzerMode);
    if (analyzerMode === "food" && userPrompt.trim()) {
      formData.append("prompt", userPrompt.trim());
    }

    try {
      const res = await fetch("/api/meals/analyze-photo", {
        method: "POST",
        body: formData,
      });
      const contentType = res.headers.get("content-type") ?? "";
      if (contentType.includes("application/json")) {
        const data = await res.json();
        if (!res.ok || data.error) throw new Error(data.error ?? "Analysis failed");
        if (data.mode === "label") {
          setReview(data as LabelReviewState);
          setServingMultiplier(1.0);
        } else {
          setReview(data as FoodReviewState);
        }
        setPhase("review");
        fetchTodayTotals();
      } else {
        const text = await res.text();
        if (res.status === 413 || text.includes("Entity Too Large")) {
          throw new Error("Image is too large to upload. Please try a smaller photo.");
        }
        throw new Error("Analysis failed");
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Analysis failed");
      setPhase("error");
    }
  }

  async function handleReestimate() {
    if (!review || review.mode !== "food") return;
    setReestimating(true);
    try {
      const res = await fetch("/api/meals/estimate-macros", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ingredients: review.ingredients }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error ?? "Re-estimation failed");
      setReview((prev) =>
        prev && prev.mode === "food"
          ? { ...data, mode: "food", meal_type_guess: prev.meal_type_guess }
          : prev
      );
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Re-estimation failed");
    } finally {
      setReestimating(false);
    }
  }

  async function handleLogFood() {
    if (!review || review.mode !== "food") return;
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

  async function handleLogLabel() {
    if (!review || review.mode !== "label") return;
    setPhase("saving");
    const m = servingMultiplier;
    const notes = `${review.product_name} — ${review.serving_size}${m !== 1 ? ` × ${m}` : ""}`;
    try {
      const res = await fetch("/api/meals/log", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          meal_type: "snack",
          notes,
          calories: Math.round(review.calories * m),
          protein_g: Math.round(review.protein_g * m * 10) / 10,
          carbs_g: Math.round(review.carbs_g * m * 10) / 10,
          fat_g: Math.round(review.fat_g * m * 10) / 10,
          fiber_g: review.fiber_g != null ? Math.round(review.fiber_g * m * 10) / 10 : null,
          sodium_mg: review.sodium_mg != null ? Math.round(review.sodium_mg * m) : null,
          source: "label",
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

  function updateMacro(field: keyof FoodReviewState, value: string, isInt: boolean) {
    const parsed = isInt ? parseInt(value, 10) : parseFloat(value);
    if (!isNaN(parsed)) setReview((prev) => (prev && prev.mode === "food" ? { ...prev, [field]: parsed } : prev));
    else if (value === "") setReview((prev) => (prev && prev.mode === "food" ? { ...prev, [field]: 0 } : prev));
  }

  // ── Pill toggle ──
  const ModeToggle = (
    <div
      className="flex items-center gap-0.5 p-0.5 rounded-lg self-start"
      style={{
        background: "var(--color-surface)",
        border: "1px solid var(--color-border)",
      }}
    >
      {(["food", "label"] as AnalyzerMode[]).map((opt) => {
        const active = opt === analyzerMode;
        return (
          <button
            key={opt}
            onClick={() => setAnalyzerMode(opt)}
            className="px-2.5 py-1 rounded-md text-xs font-medium transition-all duration-150"
            style={{
              background: active ? "var(--color-primary)" : "transparent",
              color: active ? "#fff" : "var(--color-text-muted)",
              cursor: "pointer",
              whiteSpace: "nowrap",
            }}
          >
            {opt === "food" ? "Food photo" : "Nutrition label"}
          </button>
        );
      })}
    </div>
  );

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
          {ModeToggle}

          {analyzerMode === "food" && (
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
          )}

          {analyzerMode === "label" && (
            <p style={{ fontSize: 13, color: "var(--color-text-muted)" }}>
              Point your camera at a nutrition facts label. Claude will read the exact printed values.
            </p>
          )}

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
            {analyzerMode === "food" ? "Upload or take photo" : "Scan label"}
          </button>
          <p style={{ fontSize: 12, color: "var(--color-text-faint)" }}>
            {analyzerMode === "food"
              ? "Claude identifies the food and estimates macros. Images are never stored."
              : "Claude reads exact values from the label. Images are never stored."}
          </p>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            capture="environment"
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
            <span style={{ fontSize: 15 }}>
              {analyzerMode === "label" ? "Reading label…" : "Analyzing…"}
            </span>
          </div>
        </div>
      )}

      {/* REVIEW — food mode */}
      {phase === "review" && review?.mode === "food" && (
        <div className="space-y-5">
          {previewUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={previewUrl}
              alt="Food preview"
              className="rounded-lg object-cover w-full"
              style={{ maxHeight: 180, objectFit: "cover" }}
            />
          )}

          <div>
            <p style={{ fontSize: 16, fontWeight: 600, color: "var(--color-text)" }}>
              {review.food_name}
            </p>
          </div>

          <div>
            <label style={{ fontSize: 12, color: "var(--color-text-muted)", display: "block", marginBottom: 6 }}>
              Ingredients
            </label>
            <textarea
              value={review.ingredients}
              onChange={(e) => setReview((prev) => prev && prev.mode === "food" ? { ...prev, ingredients: e.target.value } : prev)}
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

          <div>
            <label style={{ fontSize: 12, color: "var(--color-text-muted)", display: "block", marginBottom: 6 }}>
              Meal type
            </label>
            <select
              value={review.meal_type_guess}
              onChange={(e) =>
                setReview((prev) => prev && prev.mode === "food" ? { ...prev, meal_type_guess: e.target.value as MealType } : prev)
              }
              style={inputStyle}
            >
              <option value="breakfast">Breakfast</option>
              <option value="lunch">Lunch</option>
              <option value="dinner">Dinner</option>
              <option value="snack">Snack</option>
            </select>
          </div>

          <div
            className="rounded-lg p-3"
            style={{ background: "var(--color-bg)", border: "1px solid var(--color-border)" }}
          >
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
                  ] as { label: string; field: keyof FoodReviewState; unit: string; isInt?: boolean }[]
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

          {/* How this fits today */}
          {todayTotals && (
            <MacroFitRow totals={todayTotals} addingCalories={review.calories} />
          )}

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

          <div className="flex flex-col sm:flex-row gap-2 pt-1">
            <button
              onClick={handleLogFood}
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

      {/* REVIEW — label mode */}
      {phase === "review" && review?.mode === "label" && (
        <div className="space-y-4">
          {previewUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={previewUrl}
              alt="Label preview"
              className="rounded-lg object-cover w-full"
              style={{ maxHeight: 180, objectFit: "cover" }}
            />
          )}

          {!review.readable ? (
            <div className="flex items-start gap-2" style={{ color: "var(--color-warning, #f59e0b)", fontSize: 14 }}>
              <AlertCircle size={16} style={{ flexShrink: 0, marginTop: 2 }} />
              <span>Label wasn&apos;t clear enough to read — try a better-lit photo</span>
            </div>
          ) : (
            <>
              {/* Product + serving */}
              <div>
                <p style={{ fontSize: 17, fontWeight: 700, color: "var(--color-text)" }}>
                  {review.product_name}
                </p>
                <p style={{ fontSize: 13, color: "var(--color-text-muted)", marginTop: 2 }}>
                  Serving: {review.serving_size}
                  {review.servings_per_container != null && ` · ${review.servings_per_container} servings/container`}
                </p>
              </div>

              {/* Serving multiplier */}
              <div className="flex items-center gap-3">
                <label style={{ fontSize: 12, color: "var(--color-text-muted)", whiteSpace: "nowrap" }}>
                  Servings
                </label>
                <input
                  type="number"
                  min={0.5}
                  step={0.5}
                  value={servingMultiplier}
                  onChange={(e) => {
                    const v = parseFloat(e.target.value);
                    if (!isNaN(v) && v > 0) setServingMultiplier(v);
                  }}
                  style={{ ...inputStyle, width: 80 }}
                />
              </div>

              {/* Macro table */}
              <div
                className="rounded-lg overflow-hidden"
                style={{ border: "1px solid var(--color-border)" }}
              >
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
                  <tbody>
                    {[
                      { label: "Calories", value: Math.round(review.calories * servingMultiplier), unit: "" },
                      { label: "Protein", value: review.protein_g != null ? Math.round(review.protein_g * servingMultiplier * 10) / 10 : null, unit: "g" },
                      { label: "Carbs", value: review.carbs_g != null ? Math.round(review.carbs_g * servingMultiplier * 10) / 10 : null, unit: "g" },
                      { label: "Fat", value: review.fat_g != null ? Math.round(review.fat_g * servingMultiplier * 10) / 10 : null, unit: "g" },
                      { label: "Fiber", value: review.fiber_g != null ? Math.round(review.fiber_g * servingMultiplier * 10) / 10 : null, unit: "g" },
                      { label: "Sugar", value: review.sugar_g != null ? Math.round(review.sugar_g * servingMultiplier * 10) / 10 : null, unit: "g" },
                      { label: "Sodium", value: review.sodium_mg != null ? Math.round(review.sodium_mg * servingMultiplier) : null, unit: "mg" },
                    ].map(({ label, value, unit }, i) => (
                      <tr
                        key={label}
                        style={{
                          borderBottom: i < 6 ? "1px solid var(--color-border)" : undefined,
                          background: i % 2 === 0 ? "var(--color-bg)" : "var(--color-surface)",
                        }}
                      >
                        <td style={{ padding: "8px 12px", color: "var(--color-text-muted)" }}>{label}</td>
                        <td style={{ padding: "8px 12px", textAlign: "right", color: "var(--color-text)", fontWeight: 500 }}>
                          {value != null ? `${value}${unit}` : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {review.notes && (
                <p style={{ fontSize: 12, color: "var(--color-text-faint)", fontStyle: "italic" }}>
                  {review.notes}
                </p>
              )}

              {/* How this fits today */}
              {todayTotals && (
                <MacroFitRow totals={todayTotals} addingCalories={Math.round(review.calories * servingMultiplier)} />
              )}

              <div className="flex flex-col sm:flex-row gap-2 pt-1">
                <button
                  onClick={handleLogLabel}
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
                  Log this
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
            </>
          )}

          {/* Still show Cancel when unreadable */}
          {!review.readable && (
            <button
              onClick={reset}
              className="flex items-center justify-center gap-2 rounded-xl transition-opacity active:opacity-70"
              style={{
                border: "1px solid var(--color-border)",
                color: "var(--color-text-muted)",
                fontSize: 15,
                padding: "13px 20px",
                minHeight: 48,
                width: "100%",
              }}
            >
              <X size={15} />
              Try again
            </button>
          )}
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

      {/* ERROR */}
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
