"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Camera,
  Loader2,
  X,
  AlertCircle,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  Send,
  Trash2,
} from "lucide-react";

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
  ingredients?: string; // food mode only — used for re-estimation
}

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

const pillBtnBase = {
  borderRadius: 20,
  fontSize: 13,
  fontWeight: 500,
  padding: "6px 14px",
  cursor: "pointer",
  border: "1px solid var(--color-border)",
  transition: "all 0.15s",
} as const;

function MacroLine({ item }: { item: Pick<ScanItem, "calories" | "protein_g" | "carbs_g" | "fat_g"> }) {
  return (
    <span style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
      {Math.round(item.calories)} cal · {Math.round(item.protein_g)}g P · {Math.round(item.carbs_g)}g C · {Math.round(item.fat_g)}g F
    </span>
  );
}

interface FoodPhotoAnalyzerProps {
  onUnsavedItems?: (count: number) => void;
}

export default function FoodPhotoAnalyzer({ onUnsavedItems }: FoodPhotoAnalyzerProps) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  // ── Chat handoff state ────────────────────────────────────────────────────
  const [chatQuestion, setChatQuestion] = useState("");

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
    // Reset so the same file can be scanned again
    if (fileInputRef.current) fileInputRef.current.value = "";

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

  // ── Chat handoff ──────────────────────────────────────────────────────────
  function handleSendToChat() {
    if (!chatQuestion.trim() && items.length === 0) return;
    const nutritionLines = items
      .map((i) => `- ${i.label}: ${Math.round(i.calories)} cal, ${Math.round(i.protein_g)}g protein, ${Math.round(i.carbs_g)}g carbs, ${Math.round(i.fat_g)}g fat`)
      .join("\n");
    const prefillText = items.length > 0
      ? `${chatQuestion.trim()}\n\n--- Scanned nutrition data ---\n${nutritionLines}\nCombined: ${Math.round(combined.calories)} cal, ${Math.round(combined.protein_g)}g protein, ${Math.round(combined.carbs_g)}g carbs, ${Math.round(combined.fat_g)}g fat`
      : chatQuestion.trim();
    sessionStorage.setItem("chatPrefill", prefillText);
    router.push("/chat");
  }

  // ── Mode toggle ───────────────────────────────────────────────────────────
  const ModeToggle = (
    <div
      className="flex items-center gap-0.5 p-0.5 rounded-lg self-start"
      style={{
        background: "var(--color-surface)",
        border: "1px solid var(--color-border)",
      }}
    >
      {(["label", "food"] as AnalyzerMode[]).map((opt) => {
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
            {opt === "food" ? "Food Photo" : "Nutrition Label"}
          </button>
        );
      })}
    </div>
  );

  const s = parseFloat(servings) || 1;
  const n = parseInt(containers) || 1;

  return (
    <div
      className="rounded-xl p-5 flex flex-col gap-4"
      style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)" }}
    >
      {/* Mode toggle — always visible */}
      {ModeToggle}

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handleFileChange}
      />

      {/* ── LOADING overlay ─────────────────────────────────────────────── */}
      {scanPhase === "loading" && (
        <div
          className="flex items-center gap-2 rounded-lg px-3 py-2"
          style={{
            background: "var(--color-bg)",
            border: "1px solid var(--color-border)",
            color: "var(--color-text-muted)",
            fontSize: 14,
          }}
        >
          <Loader2 size={15} className="animate-spin" style={{ color: "var(--color-primary)", flexShrink: 0 }} />
          Analyzing…
        </div>
      )}

      {/* ── ERROR / recovery panel ───────────────────────────────────────── */}
      {scanPhase === "error" && (
        <div
          className="rounded-lg p-3 flex flex-col gap-3"
          style={{ background: "var(--color-bg)", border: "1px solid var(--color-border)" }}
        >
          <div className="flex items-start gap-2" style={{ color: "var(--color-danger, #ef4444)", fontSize: 14 }}>
            <AlertCircle size={15} style={{ flexShrink: 0, marginTop: 1 }} />
            <span>{errorMsg}</span>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => {
                setScanPhase("idle");
                setErrorMsg("");
                fileInputRef.current?.click();
              }}
              className="flex items-center gap-1.5 rounded-lg transition-opacity active:opacity-70"
              style={{
                background: "var(--color-primary)",
                color: "#fff",
                fontSize: 13,
                fontWeight: 500,
                padding: "8px 14px",
                border: "none",
                cursor: "pointer",
              }}
            >
              <Camera size={13} />
              Re-scan
            </button>
            <button
              onClick={() => {
                setErrorMsg("");
                setScanPhase("manual");
              }}
              className="rounded-lg transition-opacity active:opacity-70"
              style={{
                border: "1px solid var(--color-border)",
                color: "var(--color-text-muted)",
                fontSize: 13,
                padding: "8px 14px",
                background: "transparent",
                cursor: "pointer",
              }}
            >
              Enter manually
            </button>
          </div>
        </div>
      )}

      {/* ── MANUAL ENTRY form ────────────────────────────────────────────── */}
      {scanPhase === "manual" && (
        <div
          className="rounded-lg p-4 flex flex-col gap-3"
          style={{ background: "var(--color-bg)", border: "1px solid var(--color-border)" }}
        >
          <p style={{ fontSize: 13, fontWeight: 600, color: "var(--color-text)" }}>Enter nutrition manually</p>
          <input
            type="text"
            placeholder="Name (e.g. Greek Yogurt)"
            value={manualLabel}
            onChange={(e) => setManualLabel(e.target.value)}
            style={inputStyle}
          />
          <div className="grid grid-cols-2 gap-2">
            {[
              { label: "Calories", value: manualCal, set: setManualCal },
              { label: "Protein (g)", value: manualProtein, set: setManualProtein },
              { label: "Carbs (g)", value: manualCarbs, set: setManualCarbs },
              { label: "Fat (g)", value: manualFat, set: setManualFat },
            ].map(({ label, value, set }) => (
              <div key={label}>
                <label style={{ fontSize: 11, color: "var(--color-text-muted)", display: "block", marginBottom: 4 }}>
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
          <div className="flex gap-2">
            <button
              onClick={handleAddManual}
              disabled={!manualLabel.trim()}
              className="rounded-lg transition-opacity active:opacity-70 disabled:opacity-40"
              style={{
                background: "var(--color-primary)",
                color: "#fff",
                fontSize: 14,
                fontWeight: 500,
                padding: "10px 16px",
                border: "none",
                cursor: manualLabel.trim() ? "pointer" : "default",
                flex: 1,
              }}
            >
              Add to session
            </button>
            <button
              onClick={() => setScanPhase("idle")}
              className="rounded-lg transition-opacity active:opacity-70"
              style={{
                border: "1px solid var(--color-border)",
                color: "var(--color-text-muted)",
                fontSize: 14,
                padding: "10px 16px",
                background: "transparent",
                cursor: "pointer",
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* ── ITEM LIST or empty state ─────────────────────────────────────── */}
      {items.length === 0 && scanPhase === "idle" && (
        <div className="flex flex-col items-center gap-3 py-4">
          <p style={{ fontSize: 14, color: "var(--color-text-muted)", textAlign: "center" }}>
            Scan a nutrition label or food photo to get started.
          </p>
          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center justify-center gap-2 rounded-xl font-medium transition-opacity active:opacity-70"
            style={{
              background: "var(--color-primary)",
              color: "#fff",
              fontSize: 15,
              padding: "13px 24px",
              minHeight: 48,
              border: "none",
              cursor: "pointer",
            }}
          >
            <Camera size={17} />
            Scan
          </button>
        </div>
      )}

      {items.length > 0 && (
        <div className="flex flex-col gap-2">
          {items.map((item) => {
            const expanded = expandedItemId === item.id;
            return (
              <div
                key={item.id}
                className="rounded-lg p-3"
                style={{ background: "var(--color-bg)", border: "1px solid var(--color-border)" }}
              >
                <div className="flex items-start gap-2">
                  <div className="flex flex-col gap-0.5 flex-1 min-w-0">
                    <span style={{ fontSize: 14, fontWeight: 600, color: "var(--color-text)" }}>
                      {item.label}
                    </span>
                    <MacroLine item={item} />
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    {item.mode === "food" && item.ingredients && (
                      <button
                        onClick={() => setExpandedItemId(expanded ? null : item.id)}
                        className="flex items-center gap-1 rounded transition-opacity active:opacity-70"
                        style={{ fontSize: 11, color: "var(--color-text-muted)", background: "none", border: "none", cursor: "pointer", padding: "4px 6px" }}
                        title="Edit / Re-estimate"
                      >
                        {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                        Edit
                      </button>
                    )}
                    <button
                      onClick={() => removeItem(item.id)}
                      className="rounded transition-opacity active:opacity-70"
                      style={{ background: "none", border: "none", cursor: "pointer", color: "var(--color-text-muted)", padding: "4px" }}
                      title="Remove"
                    >
                      <X size={14} />
                    </button>
                  </div>
                </div>

                {/* Expand: ingredients + re-estimate */}
                {expanded && item.mode === "food" && (
                  <div className="mt-3 flex flex-col gap-2">
                    <label style={{ fontSize: 11, color: "var(--color-text-muted)", display: "block", marginBottom: 2 }}>
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
                        fontSize: 13,
                      }}
                    />
                    <button
                      onClick={() => handleReestimateItem(item.id, item.ingredients ?? "")}
                      disabled={reestimatingId === item.id || !item.ingredients?.trim()}
                      className="flex items-center gap-1.5 rounded-lg transition-opacity active:opacity-70 disabled:opacity-40"
                      style={{
                        fontSize: 13,
                        color: "var(--color-primary)",
                        padding: "6px 0",
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
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center justify-center gap-2 rounded-xl transition-opacity active:opacity-70"
              style={{
                border: "1px solid var(--color-border)",
                color: "var(--color-text-muted)",
                fontSize: 14,
                padding: "10px 16px",
                minHeight: 44,
                background: "transparent",
                cursor: "pointer",
              }}
            >
              <Camera size={14} />
              Add another scan
            </button>
          )}
        </div>
      )}

      {/* ── COMBINED TOTAL + ACTIONS (only when items exist) ────────────── */}
      {items.length > 0 && (
        <div className="flex flex-col gap-3">
          {/* Combined total */}
          <div
            className="rounded-lg px-3 py-2"
            style={{
              background: "var(--color-bg)",
              border: "1px solid var(--color-border)",
              fontSize: 13,
            }}
          >
            <span style={{ color: "var(--color-text-muted)" }}>Combined: </span>
            <span style={{ color: "var(--color-text)", fontWeight: 600 }}>
              {Math.round(combined.calories)} cal · {Math.round(combined.protein_g)}g P · {Math.round(combined.carbs_g)}g C · {Math.round(combined.fat_g)}g F
            </span>
          </div>

          {/* Ask Mr. Bridge */}
          <div className="flex flex-col gap-2">
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Ask Mr. Bridge…"
                value={chatQuestion}
                onChange={(e) => setChatQuestion(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") handleSendToChat(); }}
                style={{ ...inputStyle, flex: 1, fontSize: 14 }}
              />
              <button
                onClick={handleSendToChat}
                disabled={!chatQuestion.trim() && items.length === 0}
                className="flex items-center justify-center rounded-xl transition-opacity active:opacity-70 disabled:opacity-40"
                style={{
                  background: "var(--color-primary)",
                  color: "#fff",
                  padding: "10px 14px",
                  border: "none",
                  cursor: "pointer",
                  flexShrink: 0,
                }}
                title="Send to Chat"
              >
                <Send size={15} />
              </button>
            </div>
            <div className="flex gap-2 flex-wrap">
              {["What can I make with these?", "Calculate my macros"].map((q) => (
                <button
                  key={q}
                  onClick={() => setChatQuestion(q)}
                  className="rounded-full transition-opacity active:opacity-70"
                  style={{
                    ...pillBtnBase,
                    background: "transparent",
                    color: "var(--color-text-muted)",
                    fontSize: 12,
                  }}
                >
                  {q}
                </button>
              ))}
            </div>
          </div>

          {/* Sheet error */}
          {errorMsg && scanPhase === "idle" && (
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

          {/* Action row */}
          <div className="flex gap-2">
            <button
              onClick={() => setActiveSheet(activeSheet === "log" ? null : "log")}
              className="rounded-xl font-medium transition-opacity active:opacity-70"
              style={{
                background: activeSheet === "log" ? "var(--color-primary)" : "var(--color-bg)",
                color: activeSheet === "log" ? "#fff" : "var(--color-text)",
                border: "1px solid var(--color-border)",
                fontSize: 14,
                padding: "10px 14px",
                cursor: "pointer",
                flex: 1,
              }}
            >
              Log as meal
            </button>
            <button
              onClick={() => setActiveSheet(activeSheet === "mealprep" ? null : "mealprep")}
              className="rounded-xl font-medium transition-opacity active:opacity-70"
              style={{
                background: activeSheet === "mealprep" ? "var(--color-primary)" : "var(--color-bg)",
                color: activeSheet === "mealprep" ? "#fff" : "var(--color-text)",
                border: "1px solid var(--color-border)",
                fontSize: 14,
                padding: "10px 14px",
                cursor: "pointer",
                flex: 1,
              }}
            >
              Meal prep
            </button>
            <button
              onClick={clearAll}
              className="flex items-center justify-center rounded-xl transition-opacity active:opacity-70"
              style={{
                border: "1px solid var(--color-border)",
                color: "var(--color-text-muted)",
                padding: "10px 12px",
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
              className="rounded-xl p-4 flex flex-col gap-3"
              style={{ background: "var(--color-bg)", border: "1px solid var(--color-border)" }}
            >
              <p style={{ fontSize: 13, fontWeight: 600, color: "var(--color-text)" }}>Log as meal</p>

              {/* Meal type */}
              <div className="flex flex-wrap gap-1.5">
                {(["breakfast", "lunch", "dinner", "snack"] as MealType[]).map((t) => (
                  <button
                    key={t}
                    onClick={() => setLogMealType(t)}
                    className="rounded-full transition-all duration-150"
                    style={{
                      ...pillBtnBase,
                      background: logMealType === t ? "var(--color-primary)" : "transparent",
                      color: logMealType === t ? "#fff" : "var(--color-text-muted)",
                      borderColor: logMealType === t ? "var(--color-primary)" : "var(--color-border)",
                    }}
                  >
                    {t.charAt(0).toUpperCase() + t.slice(1)}
                  </button>
                ))}
              </div>

              {/* Servings */}
              <div className="flex items-center gap-3">
                <label style={{ fontSize: 13, color: "var(--color-text-muted)", whiteSpace: "nowrap" }}>
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
              <div style={{ fontSize: 13, color: "var(--color-text-muted)" }}>
                <span style={{ color: "var(--color-text)", fontWeight: 600 }}>
                  {Math.round(combined.calories * s)} cal · {Math.round(combined.protein_g * s * 10) / 10}g P · {Math.round(combined.carbs_g * s * 10) / 10}g C · {Math.round(combined.fat_g * s * 10) / 10}g F
                </span>
              </div>

              <button
                onClick={handleLogMeal}
                disabled={logging}
                className="flex items-center justify-center gap-2 rounded-xl font-medium transition-opacity active:opacity-70 disabled:opacity-50"
                style={{
                  background: "var(--color-primary)",
                  color: "#fff",
                  fontSize: 15,
                  padding: "13px 20px",
                  minHeight: 48,
                  border: "none",
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
              className="rounded-xl p-4 flex flex-col gap-3"
              style={{ background: "var(--color-bg)", border: "1px solid var(--color-border)" }}
            >
              <p style={{ fontSize: 13, fontWeight: 600, color: "var(--color-text)" }}>Meal prep</p>

              <div className="flex items-center gap-3">
                <label style={{ fontSize: 13, color: "var(--color-text-muted)", whiteSpace: "nowrap", flex: 1 }}>
                  Total batch makes
                </label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={batchServings}
                  onChange={(e) => setBatchServings(e.target.value)}
                  style={{ ...inputStyle, width: 70 }}
                />
                <span style={{ fontSize: 13, color: "var(--color-text-muted)", whiteSpace: "nowrap" }}>servings</span>
              </div>

              <div className="flex items-center gap-3">
                <label style={{ fontSize: 13, color: "var(--color-text-muted)", whiteSpace: "nowrap", flex: 1 }}>
                  Splitting into
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  value={containers}
                  onChange={(e) => setContainers(e.target.value)}
                  style={{ ...inputStyle, width: 70 }}
                />
                <span style={{ fontSize: 13, color: "var(--color-text-muted)", whiteSpace: "nowrap" }}>containers</span>
              </div>

              {/* Per-container preview */}
              <div style={{ fontSize: 13, color: "var(--color-text-muted)" }}>
                Per container:{" "}
                <span style={{ color: "var(--color-text)", fontWeight: 600 }}>
                  {Math.round(combined.calories / n)} cal · {Math.round((combined.protein_g / n) * 10) / 10}g P · {Math.round((combined.carbs_g / n) * 10) / 10}g C · {Math.round((combined.fat_g / n) * 10) / 10}g F
                </span>
              </div>

              {/* Meal type */}
              <div className="flex flex-wrap gap-1.5">
                {(["breakfast", "lunch", "dinner", "snack"] as MealType[]).map((t) => (
                  <button
                    key={t}
                    onClick={() => setMealPrepType(t)}
                    className="rounded-full transition-all duration-150"
                    style={{
                      ...pillBtnBase,
                      background: mealPrepType === t ? "var(--color-primary)" : "transparent",
                      color: mealPrepType === t ? "#fff" : "var(--color-text-muted)",
                      borderColor: mealPrepType === t ? "var(--color-primary)" : "var(--color-border)",
                    }}
                  >
                    {t.charAt(0).toUpperCase() + t.slice(1)}
                  </button>
                ))}
              </div>

              <button
                onClick={handleMealPrep}
                disabled={prepping}
                className="flex items-center justify-center gap-2 rounded-xl font-medium transition-opacity active:opacity-70 disabled:opacity-50"
                style={{
                  background: "var(--color-primary)",
                  color: "#fff",
                  fontSize: 15,
                  padding: "13px 20px",
                  minHeight: 48,
                  border: "none",
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
