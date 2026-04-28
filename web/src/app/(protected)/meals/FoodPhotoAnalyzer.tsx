"use client";

import { useEffect, useRef, useState } from "react";
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

export type MealType = "breakfast" | "lunch" | "dinner" | "snack";
type ScanPhase = "idle" | "error" | "manual";
type AnalyzerMode = "food" | "label";

export interface ScanItem {
  id: string;
  mode: AnalyzerMode;
  label: string;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  // Nutrient columns — null means "not estimated", rendered as "—" not "0" (#304).
  fiber_g: number | null;
  sugar_g: number | null;
  sodium_mg?: number;
  ingredients?: string;
  // Per-field manual-edit flags — re-estimate must not clobber user edits (#302).
  labelManuallyEdited?: boolean;
  caloriesManuallyEdited?: boolean;
  proteinManuallyEdited?: boolean;
  carbsManuallyEdited?: boolean;
  fatManuallyEdited?: boolean;
  fiberManuallyEdited?: boolean;
  sugarManuallyEdited?: boolean;
  // User-supplied dish description at capture time (#371).
  user_context?: string;
  // Fraction of the dish the user ate (0–1). Default 1.0 (#545).
  portionFraction: number;
}

interface PendingPhoto {
  tempId: string;
  fileName: string;
}

interface FailedPhoto {
  tempId: string;
  file: File;
  errorMsg: string;
}

// Fraction options for the per-item portion picker (#545).
const FRACTIONS: { label: string; value: number }[] = [
  { label: "¼", value: 0.25 },
  { label: "⅓", value: 1 / 3 },
  { label: "½", value: 0.5 },
  { label: "¾", value: 0.75 },
  { label: "All", value: 1 },
];

function roundOrDash(v: number | null, digits = 0): string {
  if (v === null) return "—";
  const m = 10 ** digits;
  return String(Math.round(v * m) / m);
}

function sumNullable(items: ScanItem[], field: "fiber_g" | "sugar_g"): number | null {
  let sum = 0;
  let any = false;
  for (const it of items) {
    const v = it[field];
    if (v !== null && v !== undefined) {
      sum += v * it.portionFraction;
      any = true;
    }
  }
  return any ? sum : null;
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

// Portion fraction pill picker — rendered inline in each item row (#545).
function PortionPicker({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex flex-wrap" style={{ gap: "var(--space-1)" }}>
      {FRACTIONS.map((f) => {
        const active = Math.abs(f.value - value) < 0.01;
        return (
          <button
            key={f.label}
            onClick={() => onChange(f.value)}
            style={{
              ...pillBtnBase,
              background: active ? "var(--accent)" : "transparent",
              color: active ? "var(--color-text-on-cta)" : "var(--color-text-muted)",
              borderColor: active ? "var(--accent)" : "var(--rule)",
              minWidth: 36,
              textAlign: "center" as const,
            }}
          >
            {f.label}
          </button>
        );
      })}
    </div>
  );
}

function MacroLine({ item }: { item: ScanItem }) {
  const showNutrients = item.fiber_g !== null || item.sugar_g !== null;
  return (
    <div className="flex flex-col" style={{ gap: 2 }}>
      <span
        className="tnum"
        style={{ fontSize: "var(--t-micro)", color: "var(--color-text-muted)" }}
      >
        {Math.round(item.calories)} cal · {Math.round(item.protein_g)}g P ·{" "}
        {Math.round(item.carbs_g)}g C · {Math.round(item.fat_g)}g F
      </span>
      {showNutrients && (
        <span
          className="tnum"
          style={{ fontSize: "var(--t-micro)", color: "var(--color-text-faint)" }}
        >
          Fiber {roundOrDash(item.fiber_g, 1)}g · Sugar {roundOrDash(item.sugar_g, 1)}g
        </span>
      )}
    </div>
  );
}

interface MacroInputProps {
  label: string;
  value: number | null;
  nullable?: boolean;
  integer?: boolean;
  onChange: (v: number | null) => void;
}

// Editable macro input — local text state keeps decimals and empty state
// from fighting the controlled value on external re-estimate updates (#302).
function MacroInput({ label, value, nullable, integer, onChange }: MacroInputProps) {
  const [text, setText] = useState<string>(value === null ? "" : String(value));
  const lastExternal = useRef<number | null>(value);

  useEffect(() => {
    if (value !== lastExternal.current) {
      lastExternal.current = value;
      setText(value === null ? "" : String(value));
    }
  }, [value]);

  function commit(t: string) {
    setText(t);
    if (t === "") {
      const next = nullable ? null : 0;
      lastExternal.current = next;
      onChange(next);
      return;
    }
    const pattern = integer ? /^-?\d*$/ : /^-?\d*\.?\d*$/;
    if (!pattern.test(t)) return;
    const n = integer ? parseInt(t, 10) : parseFloat(t);
    if (!Number.isFinite(n)) return;
    lastExternal.current = n;
    onChange(n);
  }

  return (
    <div>
      <label
        style={{
          fontSize: "var(--t-micro)",
          color: "var(--color-text-muted)",
          display: "block",
          marginBottom: "var(--space-1)",
        }}
      >
        {label}
      </label>
      <input
        type="text"
        inputMode={integer ? "numeric" : "decimal"}
        value={text}
        onChange={(e) => commit(e.target.value)}
        placeholder={nullable ? "—" : "0"}
        style={inputStyle}
      />
    </div>
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

  // ── Per-photo batch state (#545) ─────────────────────────────────────────
  const [pendingPhotos, setPendingPhotos] = useState<PendingPhoto[]>([]);
  const [failedPhotos, setFailedPhotos] = useState<FailedPhoto[]>([]);

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

  // ── User context (optional dish description, #371) ───────────────────────
  const [userContext, setUserContext] = useState("");
  const scanCtaRef = useRef<HTMLDivElement>(null);

  // ── Derived totals (scaled by per-item portionFraction, #545) ─────────────
  const combined = items.reduce(
    (acc, item) => ({
      calories: acc.calories + item.calories * item.portionFraction,
      protein_g: acc.protein_g + item.protein_g * item.portionFraction,
      carbs_g: acc.carbs_g + item.carbs_g * item.portionFraction,
      fat_g: acc.fat_g + item.fat_g * item.portionFraction,
    }),
    { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 },
  );
  // Nutrient totals are null when no item reports a value, so we render "—" instead of "0".
  const combinedFiber = sumNullable(items, "fiber_g");
  const combinedSugar = sumNullable(items, "sugar_g");

  // ── Unsaved count: completed items + in-flight analyses (#545) ────────────
  useEffect(() => {
    onUnsavedItems?.(items.length + pendingPhotos.length);
  }, [items.length, pendingPhotos.length, onUnsavedItems]);

  // ── Item helpers ─────────────────────────────────────────────────────────
  function addItem(item: ScanItem) {
    setItems((prev) => [...prev, item]);
  }

  function removeItem(id: string) {
    setItems((prev) => prev.filter((i) => i.id !== id));
    if (expandedItemId === id) setExpandedItemId(null);
  }

  function updateItem(id: string, patch: Partial<ScanItem>) {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, ...patch } : i)));
  }

  function clearAll() {
    setItems([]);
    setPendingPhotos([]);
    setFailedPhotos([]);
    setActiveSheet(null);
  }

  // ── Image compression ────────────────────────────────────────────────────
  // Skips canvas work for files already under 2 MB. For larger files, tries
  // quality 0.82 first; if the result is still > 4.5 MB (rare, very detailed
  // 4K photos) retries the same canvas at quality 0.70 — no re-decode needed.
  async function compressImage(file: File): Promise<Blob> {
    const THRESHOLD = 2 * 1024 * 1024;
    if (file.size <= THRESHOLD) return file;

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
            if (!blob) return reject(new Error("Compression failed"));
            if (blob.size <= 4.5 * 1024 * 1024) return resolve(blob);
            // Pass 2: same canvas, lower quality for unusually detailed photos
            canvas.toBlob(
              (blob2) => {
                if (blob2) resolve(blob2);
                else reject(new Error("Compression failed"));
              },
              "image/jpeg",
              0.7,
            );
          },
          "image/jpeg",
          0.82,
        );
      };
      img.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        reject(new Error("Failed to load image for compression"));
      };
      img.src = objectUrl;
    });
  }

  // ── Per-photo analysis — called once per file, compression included (#545) ─
  async function analyzeOneFile(file: File, tempId: string) {
    let imageBlob: Blob;
    try {
      imageBlob = await compressImage(file);
    } catch {
      if (file.size > 4 * 1024 * 1024) {
        setPendingPhotos((prev) => prev.filter((p) => p.tempId !== tempId));
        setFailedPhotos((prev) => [
          ...prev,
          {
            tempId,
            file,
            errorMsg: "Couldn't compress this photo. Try a smaller or lower-resolution image.",
          },
        ]);
        return;
      }
      imageBlob = file;
    }

    const formData = new FormData();
    formData.append("image", imageBlob, "photo.jpg");
    formData.append("mode", analyzerMode);
    const trimmedContext = userContext.trim();
    if (trimmedContext) formData.append("user_context", trimmedContext);

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
            setPendingPhotos((prev) => prev.filter((p) => p.tempId !== tempId));
            setFailedPhotos((prev) => [
              ...prev,
              {
                tempId,
                file,
                errorMsg: "Label wasn't clear enough to read — try a better-lit photo.",
              },
            ]);
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
            fiber_g: data.fiber_g ?? null,
            sugar_g: data.sugar_g ?? null,
            sodium_mg: data.sodium_mg ?? undefined,
            user_context: trimmedContext || undefined,
            portionFraction: 1,
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
            fiber_g: data.fiber_g ?? null,
            sugar_g: data.sugar_g ?? null,
            sodium_mg: data.sodium_mg ?? undefined,
            ingredients: data.ingredients ?? undefined,
            user_context: trimmedContext || undefined,
            portionFraction: 1,
          });
        }
        setPendingPhotos((prev) => prev.filter((p) => p.tempId !== tempId));
      } else {
        const text = await res.text();
        if (res.status === 413 || text.includes("Entity Too Large")) {
          throw new Error("Image is too large to upload. Please try a smaller photo.");
        }
        throw new Error("Analysis failed");
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Analysis failed";
      setPendingPhotos((prev) => prev.filter((p) => p.tempId !== tempId));
      setFailedPhotos((prev) => [...prev, { tempId, file, errorMsg: msg }]);
    }
  }

  // ── Camera capture — single file at a time, up to 6 total (#545) ─────────
  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (cameraInputRef.current) cameraInputRef.current.value = "";
    if (libraryInputRef.current) libraryInputRef.current.value = "";

    if (items.length + pendingPhotos.length >= 6) return;

    if (file.type === "image/heic" || file.name.toLowerCase().endsWith(".heic")) {
      setErrorMsg("In your iPhone Camera settings, set format to 'Most Compatible' and try again.");
      setScanPhase("error");
      return;
    }

    const tempId = crypto.randomUUID();
    setPendingPhotos((prev) => [...prev, { tempId, fileName: file.name }]);
    await analyzeOneFile(file, tempId);
  }

  // ── Library multi-select — up to 6 photos at once (#545) ─────────────────
  async function handleFilesChange(e: React.ChangeEvent<HTMLInputElement>) {
    if (libraryInputRef.current) libraryInputRef.current.value = "";
    const remaining = 6 - items.length - pendingPhotos.length;
    const files = Array.from(e.target.files ?? []).slice(0, remaining);
    if (files.length === 0) return;

    const heic = files.find(
      (f) => f.type === "image/heic" || f.name.toLowerCase().endsWith(".heic"),
    );
    if (heic) {
      setErrorMsg("In your iPhone Camera settings, set format to 'Most Compatible' and try again.");
      setScanPhase("error");
      return;
    }

    const batch = files.map((f) => ({ tempId: crypto.randomUUID(), fileName: f.name }));
    setPendingPhotos((prev) => [...prev, ...batch]);
    await Promise.allSettled(files.map((file, idx) => analyzeOneFile(file, batch[idx].tempId)));
  }

  // ── Retry a failed photo (#545) ───────────────────────────────────────────
  function retryFailedPhoto(tempId: string) {
    const entry = failedPhotos.find((f) => f.tempId === tempId);
    if (!entry) return;
    setFailedPhotos((prev) => prev.filter((f) => f.tempId !== tempId));
    setPendingPhotos((prev) => [...prev, { tempId, fileName: entry.file.name }]);
    analyzeOneFile(entry.file, tempId);
  }

  // ── Per-item re-estimation ────────────────────────────────────────────────
  async function handleReestimateItem(id: string, ingredients: string) {
    setReestimatingId(id);
    const item = items.find((i) => i.id === id);
    try {
      const res = await fetch("/api/meals/estimate-macros", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ingredients, user_context: item?.user_context }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error ?? "Re-estimation failed");
      // Respect per-field manual-edit flags — don't clobber anything the user typed (#302).
      setItems((prev) =>
        prev.map((it) => {
          if (it.id !== id) return it;
          return {
            ...it,
            label: it.labelManuallyEdited ? it.label : (data.food_name ?? it.label),
            calories: it.caloriesManuallyEdited ? it.calories : (data.calories ?? it.calories),
            protein_g: it.proteinManuallyEdited ? it.protein_g : (data.protein_g ?? it.protein_g),
            carbs_g: it.carbsManuallyEdited ? it.carbs_g : (data.carbs_g ?? it.carbs_g),
            fat_g: it.fatManuallyEdited ? it.fat_g : (data.fat_g ?? it.fat_g),
            fiber_g: it.fiberManuallyEdited ? it.fiber_g : (data.fiber_g ?? null),
            sugar_g: it.sugarManuallyEdited ? it.sugar_g : (data.sugar_g ?? null),
            // user_context is user-authored — always preserve it unchanged.
          };
        }),
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
      fiber_g: null,
      sugar_g: null,
      portionFraction: 1,
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
    const logUserContext = items.find((i) => i.user_context)?.user_context;
    setLogging(true);
    try {
      const res = await fetch("/api/meals/log", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          meal_type: logMealType,
          notes: items.map((i) => i.label).join(", "),
          user_context: logUserContext ?? undefined,
          calories: Math.round(combined.calories * s),
          protein_g: Math.round(combined.protein_g * s * 10) / 10,
          carbs_g: Math.round(combined.carbs_g * s * 10) / 10,
          fat_g: Math.round(combined.fat_g * s * 10) / 10,
          fiber_g: combinedFiber === null ? null : Math.round(combinedFiber * s * 10) / 10,
          sugar_g: combinedSugar === null ? null : Math.round(combinedSugar * s * 10) / 10,
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
      fiber_g: combinedFiber === null ? null : Math.round((combinedFiber / n) * 10) / 10,
      sugar_g: combinedSugar === null ? null : Math.round((combinedSugar / n) * 10) / 10,
    };
    const prepUserContext = items.find((i) => i.user_context)?.user_context;
    setPrepping(true);
    try {
      const res = await fetch("/api/meals/log", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          meal_type: mealPrepType,
          notes: items.map((i) => i.label).join(", "),
          user_context: prepUserContext ?? undefined,
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
      .map((i) => {
        const f = i.portionFraction;
        const pct = f < 1 ? ` (${Math.round(f * 100)}%)` : "";
        const cal = Math.round(i.calories * f);
        const p = Math.round(i.protein_g * f);
        const c = Math.round(i.carbs_g * f);
        const fat = Math.round(i.fat_g * f);
        const base = `- ${i.label}${pct}: ${cal} cal, ${p}g P, ${c}g C, ${fat}g fat`;
        const extras: string[] = [];
        if (i.fiber_g !== null) extras.push(`${roundOrDash(i.fiber_g * f, 1)}g fiber`);
        if (i.sugar_g !== null) extras.push(`${roundOrDash(i.sugar_g * f, 1)}g sugar`);
        return extras.length ? `${base}, ${extras.join(", ")}` : base;
      })
      .join("\n");
    const combinedLine =
      `Combined: ${Math.round(combined.calories)} cal, ${Math.round(combined.protein_g)}g P, ${Math.round(combined.carbs_g)}g C, ${Math.round(combined.fat_g)}g fat` +
      (combinedFiber !== null ? `, ${roundOrDash(combinedFiber, 1)}g fiber` : "") +
      (combinedSugar !== null ? `, ${roundOrDash(combinedSugar, 1)}g sugar` : "");
    return `--- Scanned nutrition data ---\n${lines}\n${combinedLine}`;
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

  const s = parseFloat(servings) || 1;
  const n = parseInt(containers) || 1;
  const photoCapReached = items.length + pendingPhotos.length >= 6;
  const hasPhotos = items.length > 0 || pendingPhotos.length > 0 || failedPhotos.length > 0;

  return (
    <div className="flex flex-col" style={{ gap: "var(--space-4)" }}>
      {/* Mode toggle — always visible */}
      {ModeToggle}

      {/* Hidden file inputs — camera (single) and library (multi-select) */}
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handleFileChange}
      />
      <input
        ref={libraryInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={handleFilesChange}
      />

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
            style={{
              gap: "var(--space-2)",
              color: "var(--color-danger)",
              fontSize: "var(--t-meta)",
            }}
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
              style={{
                ...ctaStyle,
                gap: "var(--space-1)",
                fontSize: "var(--t-micro)",
                padding: "var(--space-2) var(--space-3)",
              }}
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
              style={{
                ...ghostStyle,
                gap: "var(--space-1)",
                fontSize: "var(--t-micro)",
                padding: "var(--space-2) var(--space-3)",
              }}
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
              style={{
                ...ghostStyle,
                fontSize: "var(--t-micro)",
                padding: "var(--space-2) var(--space-3)",
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
          className="flex flex-col"
          style={{
            gap: "var(--space-3)",
            paddingTop: "var(--space-3)",
            paddingBottom: "var(--space-3)",
            borderTop: "1px solid var(--rule-soft)",
            borderBottom: "1px solid var(--rule-soft)",
          }}
        >
          <p style={{ fontSize: "var(--t-meta)", fontWeight: 600, color: "var(--color-text)" }}>
            Enter nutrition manually
          </p>
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
                <label
                  style={{
                    fontSize: "var(--t-micro)",
                    color: "var(--color-text-muted)",
                    display: "block",
                    marginBottom: "var(--space-1)",
                  }}
                >
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
      {!hasPhotos && scanPhase === "idle" && (
        <div
          className="flex flex-col items-center"
          style={{
            gap: "var(--space-3)",
            padding: "var(--space-7) var(--space-4)",
            border: "1px dashed var(--rule)",
            borderRadius: "var(--r-2)",
          }}
        >
          <p
            style={{
              fontSize: "var(--t-body)",
              color: "var(--color-text-muted)",
              textAlign: "center",
            }}
          >
            Scan a nutrition label or food photo to get started.
          </p>
          <div style={{ width: "100%", maxWidth: 360 }}>
            <textarea
              value={userContext}
              onChange={(e) => setUserContext(e.target.value)}
              maxLength={500}
              rows={3}
              placeholder="Tell Bridge what's in the dish (optional)"
              autoComplete="off"
              autoCorrect="off"
              onFocus={() =>
                scanCtaRef.current?.scrollIntoView({ block: "center", behavior: "smooth" })
              }
              style={{
                ...inputStyle,
                resize: "none",
                lineHeight: 1.6,
                fontSize: "var(--t-meta)",
              }}
            />
            {userContext.length > 0 && (
              <div
                style={{
                  fontSize: "var(--t-micro)",
                  color: "var(--color-text-faint)",
                  textAlign: "right",
                  marginTop: "var(--space-1)",
                }}
              >
                {userContext.length}/500
              </div>
            )}
          </div>
          <div
            ref={scanCtaRef}
            className="flex flex-wrap justify-center"
            style={{ gap: "var(--space-2)" }}
          >
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

      {/* ── ITEM LIST (completed + pending + failed) ──────────────────────── */}
      {hasPhotos && (
        <div className="flex flex-col">
          {/* Completed items */}
          {items.map((item, idx) => {
            const expanded = expandedItemId === item.id;
            const isFirst = idx === 0;
            return (
              <div
                key={item.id}
                style={{
                  borderTop: !isFirst ? "1px solid var(--rule-soft)" : "none",
                  padding: "var(--space-3) 0",
                }}
              >
                <div className="flex items-start" style={{ gap: "var(--space-2)" }}>
                  <div className="flex flex-col flex-1 min-w-0" style={{ gap: 2 }}>
                    <span
                      style={{
                        fontSize: "var(--t-body)",
                        fontWeight: 600,
                        color: "var(--color-text)",
                      }}
                    >
                      {item.label}
                    </span>
                    <MacroLine item={item} />
                  </div>
                  <div
                    className="flex items-center flex-shrink-0"
                    style={{ gap: "var(--space-1)" }}
                  >
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
                      title="Edit macros / re-estimate"
                    >
                      {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                      Edit
                    </button>
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

                {/* Portion picker — inline below name/macros (#545) */}
                <div style={{ marginTop: "var(--space-2)" }}>
                  <PortionPicker
                    value={item.portionFraction}
                    onChange={(v) => updateItem(item.id, { portionFraction: v })}
                  />
                </div>

                {/* Expand: editable macros + fiber/sugar + optional ingredients + re-estimate */}
                {expanded && (
                  <div
                    className="flex flex-col"
                    style={{ marginTop: "var(--space-3)", gap: "var(--space-3)" }}
                  >
                    {/* Dish name */}
                    <div>
                      <label
                        style={{
                          fontSize: "var(--t-micro)",
                          color: "var(--color-text-muted)",
                          display: "block",
                          marginBottom: "var(--space-1)",
                        }}
                      >
                        Dish name
                      </label>
                      <input
                        type="text"
                        value={item.label}
                        onChange={(e) =>
                          updateItem(item.id, { label: e.target.value, labelManuallyEdited: true })
                        }
                        style={{ ...inputStyle, fontWeight: 600, fontSize: "var(--t-body)" }}
                      />
                    </div>

                    {/* Macros grid: calories, protein, carbs, fat */}
                    <div className="grid grid-cols-2" style={{ gap: "var(--space-2)" }}>
                      <MacroInput
                        label="Calories"
                        value={item.calories}
                        integer
                        onChange={(v) =>
                          updateItem(item.id, { calories: v ?? 0, caloriesManuallyEdited: true })
                        }
                      />
                      <MacroInput
                        label="Protein (g)"
                        value={item.protein_g}
                        onChange={(v) =>
                          updateItem(item.id, { protein_g: v ?? 0, proteinManuallyEdited: true })
                        }
                      />
                      <MacroInput
                        label="Carbs (g)"
                        value={item.carbs_g}
                        onChange={(v) =>
                          updateItem(item.id, { carbs_g: v ?? 0, carbsManuallyEdited: true })
                        }
                      />
                      <MacroInput
                        label="Fat (g)"
                        value={item.fat_g}
                        onChange={(v) =>
                          updateItem(item.id, { fat_g: v ?? 0, fatManuallyEdited: true })
                        }
                      />
                      <MacroInput
                        label="Fiber (g)"
                        value={item.fiber_g}
                        nullable
                        onChange={(v) =>
                          updateItem(item.id, { fiber_g: v, fiberManuallyEdited: true })
                        }
                      />
                      <MacroInput
                        label="Sugar (g)"
                        value={item.sugar_g}
                        nullable
                        onChange={(v) =>
                          updateItem(item.id, { sugar_g: v, sugarManuallyEdited: true })
                        }
                      />
                    </div>

                    {/* Soft warning pill — calories diverge >10% from macro-derived total */}
                    {(() => {
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
                            Calories don&apos;t match macros — derived {Math.round(derived)} kcal
                            from P{Math.round(item.protein_g)} · C{Math.round(item.carbs_g)} · F
                            {Math.round(item.fat_g)}. You can log anyway.
                          </span>
                        </div>
                      );
                    })()}

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
                          onChange={(e) => updateItem(item.id, { ingredients: e.target.value })}
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
                            cursor:
                              reestimatingId === item.id || !item.ingredients?.trim()
                                ? "default"
                                : "pointer",
                            alignSelf: "flex-start",
                          }}
                        >
                          {reestimatingId === item.id ? (
                            <Loader2 size={13} className="animate-spin" />
                          ) : (
                            <RefreshCw size={13} />
                          )}
                          Re-estimate macros
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}

          {/* In-flight analyses — per-photo loading rows */}
          {pendingPhotos.map((p, idx) => (
            <div
              key={p.tempId}
              style={{
                borderTop: items.length > 0 || idx > 0 ? "1px solid var(--rule-soft)" : "none",
                padding: "var(--space-3) 0",
              }}
            >
              <div className="flex items-center" style={{ gap: "var(--space-2)" }}>
                <Loader2
                  size={13}
                  className="animate-spin"
                  style={{ color: "var(--accent)", flexShrink: 0 }}
                />
                <span
                  style={{
                    fontSize: "var(--t-body)",
                    color: "var(--color-text-muted)",
                    flex: 1,
                    minWidth: 0,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  Analyzing {p.fileName}…
                </span>
              </div>
            </div>
          ))}

          {/* Failed analyses — error rows with retry */}
          {failedPhotos.map((f, idx) => (
            <div
              key={f.tempId}
              style={{
                borderTop:
                  items.length > 0 || pendingPhotos.length > 0 || idx > 0
                    ? "1px solid var(--rule-soft)"
                    : "none",
                padding: "var(--space-3) 0",
              }}
            >
              <div className="flex items-start" style={{ gap: "var(--space-2)" }}>
                <AlertCircle
                  size={13}
                  style={{ color: "var(--color-danger)", flexShrink: 0, marginTop: 2 }}
                />
                <span
                  style={{
                    fontSize: "var(--t-meta)",
                    color: "var(--color-danger)",
                    flex: 1,
                    minWidth: 0,
                  }}
                >
                  {f.errorMsg}
                </span>
                <button
                  onClick={() => retryFailedPhoto(f.tempId)}
                  className="flex items-center transition-opacity active:opacity-70 flex-shrink-0"
                  style={{
                    gap: "var(--space-1)",
                    fontSize: "var(--t-micro)",
                    color: "var(--color-text-muted)",
                    background: "none",
                    border: "1px solid var(--rule)",
                    borderRadius: "var(--r-2)",
                    cursor: "pointer",
                    padding: "var(--space-1) var(--space-2)",
                  }}
                >
                  <RefreshCw size={11} />
                  Retry
                </button>
                <button
                  onClick={() =>
                    setFailedPhotos((prev) => prev.filter((x) => x.tempId !== f.tempId))
                  }
                  className="transition-opacity active:opacity-70 flex-shrink-0 flex items-center justify-center"
                  style={{
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    color: "var(--color-text-muted)",
                    width: 28,
                    height: 28,
                  }}
                >
                  <X size={13} />
                </button>
              </div>
            </div>
          ))}

          {/* Add another scan — hidden when cap reached */}
          {scanPhase === "idle" && !photoCapReached && (
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
          {photoCapReached && (
            <p
              style={{
                fontSize: "var(--t-micro)",
                color: "var(--color-text-faint)",
                paddingTop: "var(--space-3)",
                textAlign: "center",
              }}
            >
              Maximum 6 photos per session.
            </p>
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
              {Math.round(combined.calories)} cal · {Math.round(combined.protein_g)}g P ·{" "}
              {Math.round(combined.carbs_g)}g C · {Math.round(combined.fat_g)}g F
            </span>
            {(combinedFiber !== null || combinedSugar !== null) && (
              <div
                className="tnum"
                style={{
                  marginTop: 2,
                  fontSize: "var(--t-micro)",
                  color: "var(--color-text-faint)",
                }}
              >
                Fiber {roundOrDash(combinedFiber, 1)}g · Sugar {roundOrDash(combinedSugar, 1)}g
              </div>
            )}
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
              scanItems={items}
              defaultMealType={logMealType}
              onLoggedViaChat={() => {
                clearAll();
                router.refresh();
              }}
              onClose={() => setShowInlineChat(false)}
            />
          )}

          {/* Sheet error */}
          {errorMsg && scanPhase === "idle" && (
            <div
              className="flex items-center"
              style={{
                gap: "var(--space-2)",
                color: "var(--color-danger)",
                fontSize: "var(--t-meta)",
              }}
            >
              <AlertCircle size={14} />
              {errorMsg}
              <button
                onClick={() => setErrorMsg("")}
                style={{
                  marginLeft: "auto",
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  color: "inherit",
                }}
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
                color:
                  activeSheet === "mealprep" ? "var(--color-text-on-cta)" : "var(--color-text)",
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
              <p style={{ fontSize: "var(--t-meta)", fontWeight: 600, color: "var(--color-text)" }}>
                Log as meal
              </p>

              {/* Meal type */}
              <div className="flex flex-wrap" style={{ gap: "var(--space-1)" }}>
                {(["breakfast", "lunch", "dinner", "snack"] as MealType[]).map((t) => (
                  <button
                    key={t}
                    onClick={() => setLogMealType(t)}
                    style={{
                      ...pillBtnBase,
                      background: logMealType === t ? "var(--accent)" : "transparent",
                      color:
                        logMealType === t ? "var(--color-text-on-cta)" : "var(--color-text-muted)",
                      borderColor: logMealType === t ? "var(--accent)" : "var(--rule)",
                    }}
                  >
                    {t.charAt(0).toUpperCase() + t.slice(1)}
                  </button>
                ))}
              </div>

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
                  onChange={(e) => setServings(e.target.value)}
                  style={{ ...inputStyle, width: 80 }}
                />
              </div>

              {/* Preview */}
              <div
                className="tnum"
                style={{ fontSize: "var(--t-meta)", color: "var(--color-text-muted)" }}
              >
                <span style={{ color: "var(--color-text)", fontWeight: 600 }}>
                  {Math.round(combined.calories * s)} cal ·{" "}
                  {Math.round(combined.protein_g * s * 10) / 10}g P ·{" "}
                  {Math.round(combined.carbs_g * s * 10) / 10}g C ·{" "}
                  {Math.round(combined.fat_g * s * 10) / 10}g F
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
              <p style={{ fontSize: "var(--t-meta)", fontWeight: 600, color: "var(--color-text)" }}>
                Meal prep
              </p>

              <div className="flex items-center" style={{ gap: "var(--space-3)" }}>
                <label
                  style={{
                    fontSize: "var(--t-meta)",
                    color: "var(--color-text-muted)",
                    whiteSpace: "nowrap",
                    flex: 1,
                  }}
                >
                  Total batch makes
                </label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={batchServings}
                  onChange={(e) => setBatchServings(e.target.value)}
                  style={{ ...inputStyle, width: 72 }}
                />
                <span
                  style={{
                    fontSize: "var(--t-meta)",
                    color: "var(--color-text-muted)",
                    whiteSpace: "nowrap",
                  }}
                >
                  servings
                </span>
              </div>

              <div className="flex items-center" style={{ gap: "var(--space-3)" }}>
                <label
                  style={{
                    fontSize: "var(--t-meta)",
                    color: "var(--color-text-muted)",
                    whiteSpace: "nowrap",
                    flex: 1,
                  }}
                >
                  Splitting into
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  value={containers}
                  onChange={(e) => setContainers(e.target.value)}
                  style={{ ...inputStyle, width: 72 }}
                />
                <span
                  style={{
                    fontSize: "var(--t-meta)",
                    color: "var(--color-text-muted)",
                    whiteSpace: "nowrap",
                  }}
                >
                  containers
                </span>
              </div>

              {/* Per-container preview */}
              <div style={{ fontSize: "var(--t-meta)", color: "var(--color-text-muted)" }}>
                Per container:{" "}
                <span className="tnum" style={{ color: "var(--color-text)", fontWeight: 600 }}>
                  {Math.round(combined.calories / n)} cal ·{" "}
                  {Math.round((combined.protein_g / n) * 10) / 10}g P ·{" "}
                  {Math.round((combined.carbs_g / n) * 10) / 10}g C ·{" "}
                  {Math.round((combined.fat_g / n) * 10) / 10}g F
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
                      color:
                        mealPrepType === t ? "var(--color-text-on-cta)" : "var(--color-text-muted)",
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
