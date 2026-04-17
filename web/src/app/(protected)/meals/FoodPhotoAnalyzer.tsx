"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Camera,
  ImageIcon,
  Loader2,
  MessageSquare,
  X,
  AlertCircle,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  Trash2,
} from "lucide-react";
import InlineMealChat from "./InlineMealChat";

type MealType = "breakfast" | "lunch" | "dinner" | "snack";
type ScanPhase = "idle" | "loading" | "error" | "manual";
type AnalyzerMode = "food" | "label";

interface ScanItem {
  id: string;
  mode: AnalyzerMode;
  label: string;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g?: number;
  sodium_mg?: number;
  ingredients?: string;
}

const inputStyle = {
  background: "transparent",
  border: "1px solid var(--rule)",
  color: "var(--color-text)",
  outline: "none",
  fontSize: 16,
  borderRadius: "var(--r-2)",
  padding: "var(--space-2) var(--space-3)",
  width: "100%",
  WebkitAppearance: "none" as const,
} as const;

const ctaStyle = {
  background: "var(--accent)",
  color: "var(--color-text-on-cta)",
  border: "none",
  borderRadius: "var(--r-2)",
  fontSize: "var(--t-meta)",
  fontWeight: 500,
  padding: "var(--space-2) var(--space-4)",
  cursor: "pointer",
} as const;

const ghostStyle = {
  background: "transparent",
  color: "var(--color-text-muted)",
  border: "1px solid var(--rule)",
  borderRadius: "var(--r-2)",
  fontSize: "var(--t-meta)",
  padding: "var(--space-2) var(--space-4)",
  cursor: "pointer",
} as const;

const pillBtnBase = {
  borderRadius: 20,
  fontSize: "var(--t-micro)",
  fontWeight: 500,
  padding: "var(--space-1) var(--space-3)",
  cursor: "pointer",
  border: "1px solid var(--rule)",
  transition: "all var(--motion-fast) var(--ease-out-quart)",
} as const;

function MacroLine({ item }: { item: Pick<ScanItem, "calories" | "protein_g" | "carbs_g" | "fat_g"> }) {
  return (
    <span className="tnum" style={{ fontSize: "var(--t-micro)", color: "var(--color-text-muted)" }}>
      {Math.round(item.calories)} cal · {Math.round(item.protein_g)}g P · {Math.round(item.carbs_g)}g C · {Math.round(item.fat_g)}g F
    </span>
  );
}

interface FoodPhotoAnalyzerProps {
  onUnsavedItems?: (count: number) => void;
}

export default function FoodPhotoAnalyzer({ onUnsavedItems }: FoodPhotoAnalyzerProps) {
  const router = useRouter();
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const libraryInputRef = useRef<HTMLInputElement>(null);

  // ── Session state ─────────────────────────────────────────────────────────
  const [items, setItems] = useState<ScanItem[]>([]);
  const [scanPhase, setScanPhase] = useState<ScanPhase>("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [analyzerMode, setAnalyzerMode] = useState<AnalyzerMode>("label");
  const [activeSheet, setActiveSheet] = useState<"log" | "mealprep" | null>(null);
  const [expandedItemId, setExpandedItemId] = useState<string | null>(null);
  const [reestimatingId, setReestimatingId] = useState<string | null>(null);

  // ── Manual entry state ───────────────────────────────────────────────────
  const [manualLabel, setManualLabel] = useState("");
  const [manualCal, setManualCal] = useState("");
  const [manualProtein, setManualProtein] = useState("");
  const [manualCarbs, setManualCarbs] = useState("");
  const [manualFat, setManualFat] = useState("");

  // ── Log sheet state ───────────────────────────────────────────────────────
  const [logMealType, setLogMealType] = useState<MealType>("lunch");
  const [servings, setServings] = useState("1");
  const [logging, setLogging] = useState(false);

  // ── Meal prep sheet state ─────────────────────────────────────────────────
  const [batchServings, setBatchServings] = useState("1");
  const [containers, setContainers] = useState("1");
  const [mealPrepType, setMealPrepType] = useState<MealType>("lunch");
  const [prepping, setPrepping] = useState(false);

  // ── Inline chat state ────────────────────────────────────────────────────
  const [showInlineChat, setShowInlineChat] = useState(false);

  // ── Derived totals ────────────────────────────────────────────────────────
  const combined = items.reduce(
    (acc, item) => ({
      calories: acc.calories + item.calories,
      protein_g: acc.protein_g + item.protein_g,
      carbs_g: acc.carbs_g + item.carbs_g,
      fat_g: acc.fat_g + item.fat_g,
    }),
    { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 }
  );

  function notifyUnsaved(newItems: ScanItem[]) {
    onUnsavedItems?.(newItems.length);
  }

  function addItem(item: ScanItem) {
    setItems((prev) => {
      const next = [...prev, item];
      notifyUnsaved(next);
      return next;
    });
  }

  function removeItem(id: string) {
    setItems((prev) => {
      const next = prev.filter((i) => i.id !== id);
      notifyUnsaved(next);
      return next;
    });
    if (expandedItemId === id) setExpandedItemId(null);
  }

  function clearAll() {
    setItems([]);
    notifyUnsaved([]);
    setActiveSheet(null);
  }

  // ── Image compression (unchanged) ────────────────────────────────────────
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

  // ── Scan flow ─────────────────────────────────────────────────────────────
  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (cameraInputRef.current) cameraInputRef.current.value = "";
    if (libraryInputRef.current) libraryInputRef.current.value = "";

    if (file.type === "image/heic" || file.name.toLowerCase().endsWith(".heic")) {
      setErrorMsg("In your iPhone Camera settings, set format to 'Most Compatible' and try again.");
      setScanPhase("error");
      return;
    }

    setScanPhase("loading");

    let imageBlob: Blob;
    try {
      imageBlob = await compressImage(file);
    } catch {
      imageBlob = file;
    }

    const formData = new FormData();
    formData.append("image", imageBlob, "photo.jpg");
    formData.append("mode", analyzerMode);

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
          if (!data.readable) {
            setErrorMsg("Label wasn't clear enough to read — try a better-lit photo.");
            setScanPhase("error");
            return;
          }
          addItem({
            id: crypto.randomUUID(),
            mode: "label",
            label: data.product_name || "Nutrition Label",
            calories: data.calories ?? 0,
            protein_g: data.protein_g ?? 0,
            carbs_g: data.carbs_g ?? 0,
            fat_g: data.fat_g ?? 0,
            fiber_g: data.fiber_g ?? undefined,
            sodium_mg: data.sodium_mg ?? undefined,
          });
        } else {
          addItem({
            id: crypto.randomUUID(),
            mode: "food",
            label: data.food_name ?? "Unknown food",
            calories: data.calories ?? 0,
            protein_g: data.protein_g ?? 0,
            carbs_g: data.carbs_g ?? 0,
            fat_g: data.fat_g ?? 0,
            fiber_g: data.fiber_g ?? undefined,
            sodium_mg: data.sodium_mg ?? undefined,
            ingredients: data.ingredients ?? undefined,
          });
        }
        setScanPhase("idle");
      } else {
        const text = await res.text();
        if (res.status === 413 || text.includes("Entity Too Large")) {
          throw new Error("Image is too large to upload. Please try a smaller photo.");
        }
        throw new Error("Analysis failed");
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Analysis failed");
      setScanPhase("error");
    }
  }

  // ── Per-item re-estimation ────────────────────────────────────────────────
  async function handleReestimateItem(id: string, ingredients: string) {
    setReestimatingId(id);
    try {
      const res = await fetch("/api/meals/estimate-macros", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ingredients }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error ?? "Re-estimation failed");
      setItems((prev) =>
        prev.map((item) =>
          item.id === id
            ? {
                ...item,
                label: data.food_name ?? item.label,
                calories: data.calories ?? item.calories,
                protein_g: data.protein_g ?? item.protein_g,
                carbs_g: data.carbs_g ?? item.carbs_g,
                fat_g: data.fat_g ?? item.fat_g,
                fiber_g: data.fiber_g ?? item.fiber_g,
              }
            : item
        )
      );
    } catch {
      // non-fatal — keep existing values
    } finally {
      setReestimatingId(null);
    }
  }

  // ── Manual entry ──────────────────────────────────────────────────────────
  function handleAddManual() {
    if (!manualLabel.trim()) return;
    addItem({
      id: crypto.randomUUID(),
      mode: "food",
      label: manualLabel.trim(),
      calories: parseFloat(manualCal) || 0,
      protein_g: parseFloat(manualProtein) || 0,
      carbs_g: parseFloat(manualCarbs) || 0,
      fat_g: parseFloat(manualFat) || 0,
    });
    setManualLabel("");
    setManualCal("");
    setManualProtein("");
    setManualCarbs("");
    setManualFat("");
    setScanPhase("idle");
  }

  // ── Log as meal ───────────────────────────────────────────────────────────
  async function handleLogMeal() {
    const s = parseFloat(servings) || 1;
    setLogging(true);
    try {
      const res = await fetch("/api/meals/log", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          meal_type: logMealType,
          notes: items.map((i) => i.label).join(", "),
          calories: Math.round(combined.calories * s),
          protein_g: Math.round(combined.protein_g * s * 10) / 10,
          carbs_g: Math.round(combined.carbs_g * s * 10) / 10,
          fat_g: Math.round(combined.fat_g * s * 10) / 10,
          source: "scanner",
        }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error ?? "Failed to log meal");
      clearAll();
      setServings("1");
      router.refresh();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to log meal");
    } finally {
      setLogging(false);
    }
  }

  // ── Meal prep ─────────────────────────────────────────────────────────────
  async function handleMealPrep() {
    const n = parseInt(containers) || 1;
    const perContainer = {
      calories: Math.round(combined.calories / n),
      protein_g: Math.round((combined.protein_g / n) * 10) / 10,
      carbs_g: Math.round((combined.carbs_g / n) * 10) / 10,
      fat_g: Math.round((combined.fat_g / n) * 10) / 10,
    };
    setPrepping(true);
    try {
      const res = await fetch("/api/meals/log", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          meal_type: mealPrepType,
          notes: items.map((i) => i.label).join(", "),
          ...perContainer,
          source: "scanner",
          count: n,
        }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error ?? "Failed to log meal prep");
      clearAll();
      setBatchServings("1");
      setContainers("1");
      router.refresh();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to log meal prep");
    } finally {
      setPrepping(false);
    }
  }

  // ── Inline chat context ───────────────────────────────────────────────────
  function buildNutritionContext(): string {
    const lines = items
      .map((i) => `- ${i.label}: ${Math.round(i.calories)} cal, ${Math.round(i.protein_g)}g protein, ${Math.round(i.carbs_g)}g carbs, ${Math.round(i.fat_g)}g fat`)
      .join("\n");
    return `--- Scanned nutrition data ---\n${lines}\nCombined: ${Math.round(combined.calories)} cal, ${Math.round(combined.protein_g)}g protein, ${Math.round(combined.carbs_g)}g carbs, ${Math.round(combined.fat_g)}g fat`;
  }

  // ── Mode toggle ───────────────────────────────────────────────────────────
  const ModeToggle = (
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
      {(["label", "food"] as AnalyzerMode[]).map((opt) => {
        const active = opt === analyzerMode;
        return (
          <button
            key={opt}
            onClick={() => setAnalyzerMode(opt)}
            className="transition-all duration-150"
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
            }}
          >
            {opt === "food" ? "Food Photo" : "Nutrition Label"}
          </button>
        );
      })}
    </div>
  );

  const s = parseFloat(servings) || 1;
  const n = parseInt(containers) || 1;

  return (
    <div className="flex flex-col" style={{ gap: "var(--space-4)" }}>
      {/* Mode toggle — always visible */}
      {ModeToggle}

      {/* Hidden file inputs — camera and library */}
      <input ref={cameraInputRef}  type="file" accept="image/*" capture="environment" className="hidden" onChange={handleFileChange} />
      <input ref={libraryInputRef} type="file" accept="image/*"                        className="hidden" onChange={handleFileChange} />

      {/* ── LOADING overlay ─────────────────────────────────────────────── */}
      {scanPhase === "loading" && (
        <div
          className="flex items-center"
          style={{
            gap: "var(--space-2)",
            padding: "var(--space-2) var(--space-3)",
            borderRadius: "var(--r-2)",
            background: "transparent",
            border: "1px solid var(--rule)",
            color: "var(--color-text-muted)",
            fontSize: "var(--t-meta)",
          }}
        >
          <Loader2 size={15} className="animate-spin" style={{ color: "var(--accent)", flexShrink: 0 }} />
          Analyzing…
        </div>
      )}

      {/* ── ERROR / recovery panel ───────────────────────────────────────── */}
      {scanPhase === "error" && (
        <div
          className="flex flex-col"
          style={{
            gap: "var(--space-3)",
            padding: "var(--space-3)",
            borderRadius: "var(--r-2)",
            border: "1px solid var(--color-danger-subtle)",
            background: "transparent",
          }}
        >
          <div
            className="flex items-start"
            style={{ gap: "var(--space-2)", color: "var(--color-danger)", fontSize: "var(--t-meta)" }}
          >
            <AlertCircle size={15} style={{ flexShrink: 0, marginTop: 1 }} />
            <span>{errorMsg}</span>
          </div>
          <div className="flex flex-wrap" style={{ gap: "var(--space-2)" }}>
            <button
              onClick={() => {
                setScanPhase("idle");
                setErrorMsg("");
                cameraInputRef.current?.click();
              }}
              className="flex items-center transition-opacity active:opacity-70"
              style={{ ...ctaStyle, gap: "var(--space-1)", fontSize: "var(--t-micro)", padding: "var(--space-2) var(--space-3)" }}
            >
              <Camera size={13} />
              Camera
            </button>
            <button
              onClick={() => {
                setScanPhase("idle");
                setErrorMsg("");
                libraryInputRef.current?.click();
              }}
              className="flex items-center transition-opacity active:opacity-70"
              style={{ ...ghostStyle, gap: "var(--space-1)", fontSize: "var(--t-micro)", padding: "var(--space-2) var(--space-3)" }}
            >
              <ImageIcon size={13} />
              From Library
            </button>
            <button
              onClick={() => {
                setErrorMsg("");
                setScanPhase("manual");
              }}
              className="transition-opacity active:opacity-70"
              style={{ ...ghostStyle, fontSize: "var(--t-micro)", padding: "var(--space-2) var(--space-3)" }}
            >
              Enter manually
            </button>
          </div>
        </div>
      )}

      {/* ── MANUAL ENTRY form ────────────────────────────────────────────── */}
      {scanPhase === "manual" && (
        <div
          className="flex flex-col"
          style={{
            gap: "var(--space-3)",
            paddingTop: "var(--space-3)",
            paddingBottom: "var(--space-3)",
            borderTop: "1px solid var(--rule-soft)",
            borderBottom: "1px solid var(--rule-soft)",
          }}
        >
          <p style={{ fontSize: "var(--t-meta)", fontWeight: 600, color: "var(--color-text)" }}>Enter nutrition manually</p>
          <input
            type="text"
            placeholder="Name (e.g. Greek Yogurt)"
            value={manualLabel}
            onChange={(e) => setManualLabel(e.target.value)}
            style={inputStyle}
          />
          <div className="grid grid-cols-2" style={{ gap: "var(--space-2)" }}>
            {[
              { label: "Calories", value: manualCal, set: setManualCal },
              { label: "Protein (g)", value: manualProtein, set: setManualProtein },
              { label: "Carbs (g)", value: manualCarbs, set: setManualCarbs },
              { label: "Fat (g)", value: manualFat, set: setManualFat },
            ].map(({ label, value, set }) => (
              <div key={label}>
                <label style={{ fontSize: "var(--t-micro)", color: "var(--color-text-muted)", display: "block", marginBottom: "var(--space-1)" }}>
                  {label}
                </label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={value}
                  onChange={(e) => set(e.target.value)}
                  style={inputStyle}
                />
              </div>
            ))}
          </div>
          <div className="flex" style={{ gap: "var(--space-2)" }}>
            <button
              onClick={handleAddManual}
              disabled={!manualLabel.trim()}
              className="transition-opacity active:opacity-70 disabled:opacity-40"
              style={{
                ...ctaStyle,
                flex: 1,
                cursor: manualLabel.trim() ? "pointer" : "default",
              }}
            >
              Add to session
            </button>
            <button
              onClick={() => setScanPhase("idle")}
              className="transition-opacity active:opacity-70"
              style={ghostStyle}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* ── EMPTY STATE — dashed upload zone ─────────────────────────────── */}
      {items.length === 0 && scanPhase === "idle" && (
        <div
          className="flex flex-col items-center"
          style={{
            gap: "var(--space-3)",
            padding: "var(--space-7) var(--space-4)",
            border: "1px dashed var(--rule)",
            borderRadius: "var(--r-2)",
          }}
        >
          <p style={{ fontSize: "var(--t-body)", color: "var(--color-text-muted)", textAlign: "center" }}>
            Scan a nutrition label or food photo to get started.
          </p>
          <div className="flex flex-wrap justify-center" style={{ gap: "var(--space-2)" }}>
            <button
              onClick={() => cameraInputRef.current?.click()}
              className="flex items-center justify-center transition-opacity active:opacity-70"
              style={{
                ...ctaStyle,
                gap: "var(--space-2)",
                fontSize: "var(--t-body)",
                padding: "var(--space-3) var(--space-5)",
                minHeight: 48,
              }}
            >
              <Camera size={17} />
              Take Photo
            </button>
            <button
              onClick={() => libraryInputRef.current?.click()}
              className="flex items-center justify-center transition-opacity active:opacity-70"
              style={{
                ...ghostStyle,
                gap: "var(--space-2)",
                fontSize: "var(--t-body)",
                padding: "var(--space-3) var(--space-5)",
                minHeight: 48,
              }}
            >
              <ImageIcon size={17} />
              From Library
            </button>
          </div>
        </div>
      )}

      {/* ── ITEM LIST ────────────────────────────────────────────────────── */}
      {items.length > 0 && (
        <div className="flex flex-col">
          {items.map((item, idx) => {
            const expanded = expandedItemId === item.id;
            return (
              <div
                key={item.id}
                style={{
                  borderTop: idx > 0 ? "1px solid var(--rule-soft)" : "none",
                  padding: "var(--space-3) 0",
                }}
              >
                <div className="flex items-start" style={{ gap: "var(--space-2)" }}>
                  <div className="flex flex-col flex-1 min-w-0" style={{ gap: 2 }}>
                    <span style={{ fontSize: "var(--t-body)", fontWeight: 600, color: "var(--color-text)" }}>
                      {item.label}
                    </span>
                    <MacroLine item={item} />
                  </div>
                  <div className="flex items-center flex-shrink-0" style={{ gap: "var(--space-1)" }}>
                    {item.mode === "food" && item.ingredients && (
                      <button
                        onClick={() => setExpandedItemId(expanded ? null : item.id)}
                        className="flex items-center transition-opacity active:opacity-70"
                        style={{
                          gap: "var(--space-1)",
                          fontSize: "var(--t-micro)",
                          color: "var(--color-text-muted)",
                          background: "none",
                          border: "none",
                          cursor: "pointer",
                          padding: "var(--space-1) var(--space-2)",
                        }}
                        title="Edit / Re-estimate"
                      >
                        {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                        Edit
                      </button>
                    )}
                    <button
                      onClick={() => removeItem(item.id)}
                      className="transition-opacity active:opacity-70 flex items-center justify-center"
                      style={{
                        background: "none",
                        border: "none",
                        cursor: "pointer",
                        color: "var(--color-text-muted)",
                        width: 32,
                        height: 32,
                      }}
                      title="Remove"
                    >
                      <X size={14} />
                    </button>
                  </div>
                </div>

                {/* Expand: dish name + ingredients + re-estimate */}
                {expanded && item.mode === "food" && (
                  <div className="flex flex-col" style={{ marginTop: "var(--space-3)", gap: "var(--space-2)" }}>
                    <label style={{ fontSize: "var(--t-micro)", color: "var(--color-text-muted)", display: "block" }}>
                      Dish name
                    </label>
                    <input
                      type="text"
                      value={item.label}
                      onChange={(e) =>
                        setItems((prev) =>
                          prev.map((i) => i.id === item.id ? { ...i, label: e.target.value } : i)
                        )
                      }
                      style={{ ...inputStyle, fontWeight: 600, fontSize: "var(--t-body)" }}
                    />
                    <label style={{ fontSize: "var(--t-micro)", color: "var(--color-text-muted)", display: "block" }}>
                      Ingredients
                    </label>
                    <textarea
                      value={item.ingredients ?? ""}
                      rows={3}
                      autoComplete="off"
                      autoCorrect="off"
                      onChange={(e) =>
                        setItems((prev) =>
                          prev.map((i) => i.id === item.id ? { ...i, ingredients: e.target.value } : i)
                        )
                      }
                      style={{
                        ...inputStyle,
                        resize: "none",
                        lineHeight: 1.6,
                        fontSize: "var(--t-meta)",
                      }}
                    />
                    <button
                      onClick={() => handleReestimateItem(item.id, item.ingredients ?? "")}
                      disabled={reestimatingId === item.id || !item.ingredients?.trim()}
                      className="flex items-center transition-opacity active:opacity-70 disabled:opacity-40"
                      style={{
                        gap: "var(--space-1)",
                        fontSize: "var(--t-meta)",
                        color: "var(--accent)",
                        padding: "var(--space-1) 0",
                        background: "none",
                        border: "none",
                        cursor: (reestimatingId === item.id || !item.ingredients?.trim()) ? "default" : "pointer",
                        alignSelf: "flex-start",
                      }}
                    >
                      {reestimatingId === item.id
                        ? <Loader2 size={13} className="animate-spin" />
                        : <RefreshCw size={13} />}
                      Re-estimate macros
                    </button>
                  </div>
                )}
              </div>
            );
          })}

          {/* Add another scan */}
          {scanPhase === "idle" && (
            <div className="flex" style={{ gap: "var(--space-2)", paddingTop: "var(--space-3)" }}>
              <button
                onClick={() => cameraInputRef.current?.click()}
                className="flex items-center justify-center transition-opacity active:opacity-70"
                style={{
                  ...ghostStyle,
                  gap: "var(--space-2)",
                  fontSize: "var(--t-micro)",
                  padding: "var(--space-2) var(--space-3)",
                  minHeight: 40,
                  flex: 1,
                }}
              >
                <Camera size={13} />
                Take Photo
              </button>
              <button
                onClick={() => libraryInputRef.current?.click()}
                className="flex items-center justify-center transition-opacity active:opacity-70"
                style={{
                  ...ghostStyle,
                  gap: "var(--space-2)",
                  fontSize: "var(--t-micro)",
                  padding: "var(--space-2) var(--space-3)",
                  minHeight: 40,
                  flex: 1,
                }}
              >
                <ImageIcon size={13} />
                From Library
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── COMBINED TOTAL + ACTIONS (only when items exist) ────────────── */}
      {items.length > 0 && (
        <div className="flex flex-col" style={{ gap: "var(--space-3)" }}>
          {/* Combined total — hairline row, no card */}
          <div
            style={{
              paddingTop: "var(--space-3)",
              paddingBottom: "var(--space-3)",
              borderTop: "1px solid var(--rule)",
              borderBottom: "1px solid var(--rule)",
              fontSize: "var(--t-meta)",
            }}
          >
            <span style={{ color: "var(--color-text-muted)" }}>Combined: </span>
            <span className="tnum" style={{ color: "var(--color-text)", fontWeight: 600 }}>
              {Math.round(combined.calories)} cal · {Math.round(combined.protein_g)}g P · {Math.round(combined.carbs_g)}g C · {Math.round(combined.fat_g)}g F
            </span>
          </div>

          {/* Ask Mr. Bridge */}
          {!showInlineChat ? (
            <button
              onClick={() => setShowInlineChat(true)}
              className="flex items-center transition-opacity active:opacity-70"
              style={{
                ...ghostStyle,
                gap: "var(--space-2)",
                fontSize: "var(--t-meta)",
                padding: "var(--space-3) var(--space-4)",
              }}
            >
              <MessageSquare size={14} />
              Ask Mr. Bridge…
            </button>
          ) : (
            <InlineMealChat
              initialContext={buildNutritionContext()}
              onClose={() => setShowInlineChat(false)}
            />
          )}

          {/* Sheet error */}
          {errorMsg && scanPhase === "idle" && (
            <div
              className="flex items-center"
              style={{ gap: "var(--space-2)", color: "var(--color-danger)", fontSize: "var(--t-meta)" }}
            >
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

          {/* Action row */}
          <div className="flex" style={{ gap: "var(--space-2)" }}>
            <button
              onClick={() => setActiveSheet(activeSheet === "log" ? null : "log")}
              className="transition-opacity active:opacity-70"
              style={{
                background: activeSheet === "log" ? "var(--accent)" : "transparent",
                color: activeSheet === "log" ? "var(--color-text-on-cta)" : "var(--color-text)",
                border: "1px solid var(--rule)",
                borderRadius: "var(--r-2)",
                fontSize: "var(--t-meta)",
                fontWeight: 500,
                padding: "var(--space-2) var(--space-4)",
                cursor: "pointer",
                flex: 1,
              }}
            >
              Log as meal
            </button>
            <button
              onClick={() => setActiveSheet(activeSheet === "mealprep" ? null : "mealprep")}
              className="transition-opacity active:opacity-70"
              style={{
                background: activeSheet === "mealprep" ? "var(--accent)" : "transparent",
                color: activeSheet === "mealprep" ? "var(--color-text-on-cta)" : "var(--color-text)",
                border: "1px solid var(--rule)",
                borderRadius: "var(--r-2)",
                fontSize: "var(--t-meta)",
                fontWeight: 500,
                padding: "var(--space-2) var(--space-4)",
                cursor: "pointer",
                flex: 1,
              }}
            >
              Meal prep
            </button>
            <button
              onClick={clearAll}
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

          {/* ── LOG SHEET ──────────────────────────────────────────────── */}
          {activeSheet === "log" && (
            <div
              className="flex flex-col"
              style={{
                gap: "var(--space-3)",
                paddingTop: "var(--space-3)",
                borderTop: "1px solid var(--rule-soft)",
              }}
            >
              <p style={{ fontSize: "var(--t-meta)", fontWeight: 600, color: "var(--color-text)" }}>Log as meal</p>

              {/* Meal type */}
              <div className="flex flex-wrap" style={{ gap: "var(--space-1)" }}>
                {(["breakfast", "lunch", "dinner", "snack"] as MealType[]).map((t) => (
                  <button
                    key={t}
                    onClick={() => setLogMealType(t)}
                    style={{
                      ...pillBtnBase,
                      background: logMealType === t ? "var(--accent)" : "transparent",
                      color: logMealType === t ? "var(--color-text-on-cta)" : "var(--color-text-muted)",
                      borderColor: logMealType === t ? "var(--accent)" : "var(--rule)",
                    }}
                  >
                    {t.charAt(0).toUpperCase() + t.slice(1)}
                  </button>
                ))}
              </div>

              {/* Servings */}
              <div className="flex items-center" style={{ gap: "var(--space-3)" }}>
                <label style={{ fontSize: "var(--t-meta)", color: "var(--color-text-muted)", whiteSpace: "nowrap" }}>
                  Servings
                </label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={servings}
                  onChange={(e) => setServings(e.target.value)}
                  style={{ ...inputStyle, width: 80 }}
                />
              </div>

              {/* Preview */}
              <div className="tnum" style={{ fontSize: "var(--t-meta)", color: "var(--color-text-muted)" }}>
                <span style={{ color: "var(--color-text)", fontWeight: 600 }}>
                  {Math.round(combined.calories * s)} cal · {Math.round(combined.protein_g * s * 10) / 10}g P · {Math.round(combined.carbs_g * s * 10) / 10}g C · {Math.round(combined.fat_g * s * 10) / 10}g F
                </span>
              </div>

              <button
                onClick={handleLogMeal}
                disabled={logging}
                className="flex items-center justify-center transition-opacity active:opacity-70 disabled:opacity-50"
                style={{
                  ...ctaStyle,
                  gap: "var(--space-2)",
                  fontSize: "var(--t-body)",
                  padding: "var(--space-3) var(--space-5)",
                  minHeight: 48,
                  cursor: logging ? "default" : "pointer",
                }}
              >
                {logging && <Loader2 size={15} className="animate-spin" />}
                Log {logMealType}
              </button>
            </div>
          )}

          {/* ── MEAL PREP SHEET ────────────────────────────────────────── */}
          {activeSheet === "mealprep" && (
            <div
              className="flex flex-col"
              style={{
                gap: "var(--space-3)",
                paddingTop: "var(--space-3)",
                borderTop: "1px solid var(--rule-soft)",
              }}
            >
              <p style={{ fontSize: "var(--t-meta)", fontWeight: 600, color: "var(--color-text)" }}>Meal prep</p>

              <div className="flex items-center" style={{ gap: "var(--space-3)" }}>
                <label style={{ fontSize: "var(--t-meta)", color: "var(--color-text-muted)", whiteSpace: "nowrap", flex: 1 }}>
                  Total batch makes
                </label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={batchServings}
                  onChange={(e) => setBatchServings(e.target.value)}
                  style={{ ...inputStyle, width: 72 }}
                />
                <span style={{ fontSize: "var(--t-meta)", color: "var(--color-text-muted)", whiteSpace: "nowrap" }}>servings</span>
              </div>

              <div className="flex items-center" style={{ gap: "var(--space-3)" }}>
                <label style={{ fontSize: "var(--t-meta)", color: "var(--color-text-muted)", whiteSpace: "nowrap", flex: 1 }}>
                  Splitting into
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  value={containers}
                  onChange={(e) => setContainers(e.target.value)}
                  style={{ ...inputStyle, width: 72 }}
                />
                <span style={{ fontSize: "var(--t-meta)", color: "var(--color-text-muted)", whiteSpace: "nowrap" }}>containers</span>
              </div>

              {/* Per-container preview */}
              <div style={{ fontSize: "var(--t-meta)", color: "var(--color-text-muted)" }}>
                Per container:{" "}
                <span className="tnum" style={{ color: "var(--color-text)", fontWeight: 600 }}>
                  {Math.round(combined.calories / n)} cal · {Math.round((combined.protein_g / n) * 10) / 10}g P · {Math.round((combined.carbs_g / n) * 10) / 10}g C · {Math.round((combined.fat_g / n) * 10) / 10}g F
                </span>
              </div>

              {/* Meal type */}
              <div className="flex flex-wrap" style={{ gap: "var(--space-1)" }}>
                {(["breakfast", "lunch", "dinner", "snack"] as MealType[]).map((t) => (
                  <button
                    key={t}
                    onClick={() => setMealPrepType(t)}
                    style={{
                      ...pillBtnBase,
                      background: mealPrepType === t ? "var(--accent)" : "transparent",
                      color: mealPrepType === t ? "var(--color-text-on-cta)" : "var(--color-text-muted)",
                      borderColor: mealPrepType === t ? "var(--accent)" : "var(--rule)",
                    }}
                  >
                    {t.charAt(0).toUpperCase() + t.slice(1)}
                  </button>
                ))}
              </div>

              <button
                onClick={handleMealPrep}
                disabled={prepping}
                className="flex items-center justify-center transition-opacity active:opacity-70 disabled:opacity-50"
                style={{
                  ...ctaStyle,
                  gap: "var(--space-2)",
                  fontSize: "var(--t-body)",
                  padding: "var(--space-3) var(--space-5)",
                  minHeight: 48,
                  cursor: prepping ? "default" : "pointer",
                }}
              >
                {prepping && <Loader2 size={15} className="animate-spin" />}
                Log {n} container{n !== 1 ? "s" : ""}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
