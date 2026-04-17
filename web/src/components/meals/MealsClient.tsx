"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { MessageSquare, ChevronDown, ChevronUp, RefreshCw, Loader2 } from "lucide-react";
import Link from "next/link";
import dynamic from "next/dynamic";

const FoodPhotoAnalyzer = dynamic(
  () => import("@/app/(protected)/meals/FoodPhotoAnalyzer"),
  { ssr: false }
);

// ─── Types ───────────────────────────────────────────────────────────────────

export interface MealRow {
  id: string;
  date: string;
  meal_type: string;
  notes: string | null;
  recipes: { name: string } | null;
  calories: number | null;
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
  fiber_g: number | null;
  sugar_g: number | null;
}

export interface RecipeRow {
  id: string;
  name: string;
  cuisine: string | null;
  tags: string[] | null;
  ingredients: string | null;
}

export interface MacroGoals {
  calories: number | null;
  protein: number | null;
  carbs: number | null;
  fat: number | null;
  fiber: number | null;
}

export interface MacroTotals {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  // null when no meal today reports fiber/sugar — renders as "—" not 0 (#304).
  fiber: number | null;
  sugar: number | null;
}

interface Suggestion {
  name: string;
  description: string;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  isSaved: boolean;
  recipeId?: string;
}

interface Props {
  todayMeals: MealRow[];
  pastMeals: MealRow[];
  recipes: RecipeRow[];
  macroGoals: MacroGoals;
  macroTotals: MacroTotals;
}

// ─── Constants ────────────────────────────────────────────────────────────────

type Tab = "today" | "recipes" | "scanner" | "plan";

const TABS: { id: Tab; label: string }[] = [
  { id: "today", label: "Today" },
  { id: "recipes", label: "Recipes" },
  { id: "scanner", label: "Scanner" },
  { id: "plan", label: "Plan" },
];

const MEAL_ORDER: Record<string, number> = {
  breakfast: 0, lunch: 1, dinner: 2, snack: 3,
};

const MEAL_TYPES = ["breakfast", "lunch", "dinner", "snack"] as const;
type MealType = typeof MEAL_TYPES[number];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function normalizeName(s: string | null | undefined): string {
  return (s ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

// ─── Shared styles ────────────────────────────────────────────────────────────

const inputStyle = {
  background: "transparent",
  border: "1px solid var(--rule)",
  color: "var(--color-text)",
  outline: "none",
  fontSize: 16, // Prevents iOS auto-zoom on focus
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

// ─── Macro progress bar ───────────────────────────────────────────────────────

function progressColor(pct: number): string {
  if (pct > 100) return "var(--color-danger)";
  if (pct >= 85) return "var(--color-warning)";
  return "var(--color-positive)";
}

interface MacroBarProps {
  label: string;
  unit: string;
  consumed: number;
  goal: number | null;
}

// Sugar has no goal — we show a running total for awareness (#304).
function SugarTotalRow({ sugar }: { sugar: number | null }) {
  return (
    <div
      className="flex items-baseline justify-between"
      style={{
        paddingTop: "var(--space-3)",
        paddingBottom: "var(--space-3)",
        borderTop: "1px solid var(--rule-soft)",
      }}
    >
      <span style={{ fontSize: "var(--t-meta)", fontWeight: 500, color: "var(--color-text)" }}>
        Sugar
      </span>
      <span className="tnum" style={{ fontSize: "var(--t-meta)", color: "var(--color-text)" }}>
        {sugar === null ? "—" : sugar}
        <span style={{ color: "var(--color-text-muted)", fontSize: "var(--t-micro)" }}>g</span>
      </span>
    </div>
  );
}

function MacroBar({ label, unit, consumed, goal }: MacroBarProps) {
  if (goal === null) return null;
  const pct = goal > 0 ? (consumed / goal) * 100 : 0;
  const color = progressColor(pct);
  const remaining = goal - consumed;
  const isOver = remaining < 0;
  const clamped = Math.min(pct, 100);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "var(--space-2)",
        paddingTop: "var(--space-3)",
        paddingBottom: "var(--space-3)",
        borderTop: "1px solid var(--rule-soft)",
      }}
    >
      <div className="flex items-baseline justify-between">
        <span style={{ fontSize: "var(--t-meta)", fontWeight: 500, color: "var(--color-text)" }}>
          {label}
        </span>
        <div className="flex items-baseline tnum" style={{ gap: "var(--space-2)" }}>
          <span style={{ fontSize: "var(--t-meta)", color: "var(--color-text)" }}>
            {consumed}
            <span style={{ color: "var(--color-text-muted)", fontSize: "var(--t-micro)" }}>{unit}</span>
          </span>
          <span style={{ fontSize: "var(--t-micro)", color: "var(--color-text-faint)" }}>/</span>
          <span style={{ fontSize: "var(--t-micro)", color: "var(--color-text-muted)" }}>
            {goal}{unit}
          </span>
          <span style={{ fontSize: "var(--t-micro)", fontWeight: 500, color, minWidth: 64, textAlign: "right" }}>
            {isOver
              ? `+${Math.abs(remaining)}${unit} over`
              : `${remaining}${unit} left`}
          </span>
        </div>
      </div>
      <div className="rounded-full overflow-hidden" style={{ height: 3, background: "var(--rule-soft)" }}>
        <div
          className="h-full rounded-full transition-all duration-300"
          style={{ width: `${clamped}%`, background: color }}
        />
      </div>
    </div>
  );
}

// ─── Meal row (flat, hairline, tabular macros column) ────────────────────────

interface MealRowDisplayProps {
  meal: MealRow;
  onClick: () => void;
  onRelog?: () => void;
}

function formatMacroCol(m: MealRow): string | null {
  const hasMacros = m.calories != null || m.protein_g != null;
  if (!hasMacros) return null;
  return [
    m.calories != null ? `${m.calories} cal` : null,
    m.protein_g != null ? `P ${m.protein_g}` : null,
    m.carbs_g != null ? `C ${m.carbs_g}` : null,
    m.fat_g != null ? `F ${m.fat_g}` : null,
  ].filter(Boolean).join(" · ");
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

function MealRowDisplay({ meal, onClick, onRelog }: MealRowDisplayProps) {
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
        {meal.recipes?.name ?? meal.notes ?? "—"}
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
          onClick={(e) => { e.stopPropagation(); onRelog(); }}
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
    </div>
  );
}

interface MealRowEditFields {
  notes: string;
  meal_type: string;
  calories: string;
  protein_g: string;
  carbs_g: string;
  fat_g: string;
  fiber_g: string;
  sugar_g: string;
}

function MealRowEdit({
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
          value={fields.meal_type}
          onChange={(e) => onChange({ ...fields, meal_type: e.target.value })}
          style={{ ...inputStyle, width: "auto", minWidth: 110, flexShrink: 0 }}
        >
          {MEAL_TYPES.map((t) => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
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
            placeholder={{ calories: "Cal", protein_g: "P(g)", carbs_g: "C(g)", fat_g: "F(g)" }[field]}
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
    </div>
  );
}

// ─── Today Tab ────────────────────────────────────────────────────────────────

function TodayTab({
  todayMeals,
  pastMeals,
  macroGoals,
  macroTotals,
}: {
  todayMeals: MealRow[];
  pastMeals: MealRow[];
  macroGoals: MacroGoals;
  macroTotals: MacroTotals;
}) {
  const router = useRouter();
  const [logMealType, setLogMealType] = useState<MealType>("breakfast");
  const [logDesc, setLogDesc] = useState("");
  const [macrosOpen, setMacrosOpen] = useState(false);
  const [logCal, setLogCal] = useState("");
  const [logProtein, setLogProtein] = useState("");
  const [logCarbs, setLogCarbs] = useState("");
  const [logFat, setLogFat] = useState("");
  const [logging, setLogging] = useState(false);
  const [reanalyzing, setReanalyzing] = useState(false);
  const [ingredientsOpen, setIngredientsOpen] = useState(false);
  const [logIngredients, setLogIngredients] = useState("");
  const logSaveRef = useRef<HTMLButtonElement>(null);
  const quickLogRef = useRef<HTMLDivElement>(null);

  function prefillLog(m: MealRow) {
    const name = m.recipes?.name ?? m.notes ?? "";
    setLogDesc(name);
    setLogMealType((MEAL_TYPES as readonly string[]).includes(m.meal_type) ? (m.meal_type as MealType) : "breakfast");
    setLogCal(m.calories != null ? String(m.calories) : "");
    setLogProtein(m.protein_g != null ? String(m.protein_g) : "");
    setLogCarbs(m.carbs_g != null ? String(m.carbs_g) : "");
    setLogFat(m.fat_g != null ? String(m.fat_g) : "");
    if (m.calories != null || m.protein_g != null || m.carbs_g != null || m.fat_g != null) {
      setMacrosOpen(true);
    }
    quickLogRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    setTimeout(() => logSaveRef.current?.focus(), 250);
  }

  async function handleReanalyze() {
    if (!logIngredients.trim() && !logDesc.trim()) return;
    setReanalyzing(true);
    try {
      const current_macros = {
        calories: logCal ? Number(logCal) : undefined,
        protein_g: logProtein ? Number(logProtein) : undefined,
        carbs_g: logCarbs ? Number(logCarbs) : undefined,
        fat_g: logFat ? Number(logFat) : undefined,
      };
      const res = await fetch("/api/meals/estimate-macros", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ingredients: logIngredients.trim(),
          dish_name: logDesc.trim(),
          current_macros,
        }),
      });
      if (!res.ok) return;
      const est = await res.json();
      if (est.calories != null) setLogCal(String(est.calories));
      if (est.protein_g != null) setLogProtein(String(est.protein_g));
      if (est.carbs_g != null) setLogCarbs(String(est.carbs_g));
      if (est.fat_g != null) setLogFat(String(est.fat_g));
      if (est.meal_type_guess && (MEAL_TYPES as readonly string[]).includes(est.meal_type_guess)) {
        setLogMealType(est.meal_type_guess as MealType);
      }
      setMacrosOpen(true);
    } finally {
      setReanalyzing(false);
    }
  }

  const recentMeals = useMemo(() => {
    const byKey = new Map<string, MealRow>();
    const sorted = [...pastMeals].sort((a, b) => (a.date < b.date ? 1 : -1));
    for (const m of sorted) {
      const key = normalizeName(m.recipes?.name ?? m.notes);
      if (!key) continue;
      if (!byKey.has(key)) byKey.set(key, m);
    }
    return Array.from(byKey.values()).slice(0, 10);
  }, [pastMeals]);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editFields, setEditFields] = useState<MealRowEditFields>({
    notes: "", meal_type: "breakfast", calories: "", protein_g: "", carbs_g: "", fat_g: "", fiber_g: "", sugar_g: "",
  });
  const [editSaving, setEditSaving] = useState(false);

  function startEdit(m: MealRow) {
    setEditingId(m.id);
    setEditFields({
      notes: m.notes ?? "",
      meal_type: m.meal_type,
      calories: m.calories != null ? String(m.calories) : "",
      protein_g: m.protein_g != null ? String(m.protein_g) : "",
      carbs_g: m.carbs_g != null ? String(m.carbs_g) : "",
      fat_g: m.fat_g != null ? String(m.fat_g) : "",
      fiber_g: m.fiber_g != null ? String(m.fiber_g) : "",
      sugar_g: m.sugar_g != null ? String(m.sugar_g) : "",
    });
  }

  async function saveEdit(id: string) {
    setEditSaving(true);
    await fetch("/api/meals/log", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id,
        notes: editFields.notes || null,
        meal_type: editFields.meal_type,
        calories: editFields.calories ? Number(editFields.calories) : null,
        protein_g: editFields.protein_g ? Number(editFields.protein_g) : null,
        carbs_g: editFields.carbs_g ? Number(editFields.carbs_g) : null,
        fat_g: editFields.fat_g ? Number(editFields.fat_g) : null,
        fiber_g: editFields.fiber_g ? Number(editFields.fiber_g) : null,
        sugar_g: editFields.sugar_g ? Number(editFields.sugar_g) : null,
      }),
    });
    setEditSaving(false);
    setEditingId(null);
    router.refresh();
  }

  const hasAnyGoal =
    macroGoals.calories !== null ||
    macroGoals.protein !== null ||
    macroGoals.carbs !== null ||
    macroGoals.fat !== null;

  const sortedMeals = [...todayMeals].sort(
    (a, b) => (MEAL_ORDER[a.meal_type] ?? 9) - (MEAL_ORDER[b.meal_type] ?? 9)
  );

  async function handleLog() {
    if (!logDesc.trim()) return;
    setLogging(true);
    try {
      const body: Record<string, string | number> = {
        meal_type: logMealType,
        notes: logDesc.trim(),
      };
      if (logCal && !isNaN(parseInt(logCal, 10))) body.calories = parseInt(logCal, 10);
      if (logProtein && !isNaN(parseFloat(logProtein))) body.protein_g = parseFloat(logProtein);
      if (logCarbs && !isNaN(parseFloat(logCarbs))) body.carbs_g = parseFloat(logCarbs);
      if (logFat && !isNaN(parseFloat(logFat))) body.fat_g = parseFloat(logFat);

      const res = await fetch("/api/meals/log", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error("Failed to log meal");

      setLogDesc("");
      setLogCal("");
      setLogProtein("");
      setLogCarbs("");
      setLogFat("");
      setLogIngredients("");
      setIngredientsOpen(false);
      setMacrosOpen(false);
      router.refresh();
    } finally {
      setLogging(false);
    }
  }

  return (
    <div className="flex flex-col" style={{ gap: "var(--space-7)" }}>
      {/* Macros section */}
      <section>
        <h2 className="db-section-label">Today&apos;s Macros</h2>
        {hasAnyGoal ? (
          <div>
            <MacroBar label="Calories" unit=" kcal" consumed={macroTotals.calories} goal={macroGoals.calories} />
            <MacroBar label="Protein" unit="g" consumed={macroTotals.protein} goal={macroGoals.protein} />
            <MacroBar label="Carbs" unit="g" consumed={macroTotals.carbs} goal={macroGoals.carbs} />
            <MacroBar label="Fat" unit="g" consumed={macroTotals.fat} goal={macroGoals.fat} />
            <MacroBar
              label="Fiber"
              unit="g"
              consumed={macroTotals.fiber ?? 0}
              goal={macroGoals.fiber}
            />
            <SugarTotalRow sugar={macroTotals.sugar} />
          </div>
        ) : (
          <p style={{ fontSize: "var(--t-body)", color: "var(--color-text-muted)" }}>
            No nutrition goals set.{" "}
            <Link
              href="/settings"
              style={{ color: "var(--accent)", textDecoration: "underline", textUnderlineOffset: 2 }}
            >
              Configure goals in Settings
            </Link>{" "}
            to track progress here.
          </p>
        )}
      </section>

      {/* Today's logged meals */}
      <section>
        <h2 className="db-section-label">Logged Today</h2>
        {sortedMeals.length === 0 ? (
          <p style={{ fontSize: "var(--t-body)", color: "var(--color-text-faint)" }}>
            Nothing logged yet today.
          </p>
        ) : (
          <div>
            {sortedMeals.map((m, i) => (
              <div
                key={m.id}
                style={i > 0 ? { borderTop: "1px solid var(--rule-soft)" } : {}}
              >
                {editingId === m.id ? (
                  <MealRowEdit
                    fields={editFields}
                    saving={editSaving}
                    onChange={setEditFields}
                    onSave={() => saveEdit(m.id)}
                    onCancel={() => setEditingId(null)}
                  />
                ) : (
                  <MealRowDisplay meal={m} onClick={() => startEdit(m)} onRelog={() => prefillLog(m)} />
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Quick log form */}
      <section ref={quickLogRef}>
        <h2 className="db-section-label">Quick log</h2>
        <div className="flex" style={{ gap: "var(--space-2)", marginBottom: "var(--space-2)" }}>
          <select
            value={logMealType}
            onChange={(e) => setLogMealType(e.target.value as MealType)}
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
            value={logDesc}
            onChange={(e) => setLogDesc(e.target.value)}
            placeholder="What did you eat?"
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) handleLog(); }}
            style={{ ...inputStyle, flex: 1 }}
          />
          <button
            ref={logSaveRef}
            onClick={handleLog}
            disabled={logging || !logDesc.trim()}
            className="flex items-center justify-center transition-opacity active:opacity-70 disabled:opacity-40"
            style={{ ...ctaStyle, whiteSpace: "nowrap", flexShrink: 0 }}
          >
            {logging ? <Loader2 size={14} className="animate-spin" /> : "Log"}
          </button>
        </div>

        <div
          className="flex items-center flex-wrap"
          style={{ gap: "var(--space-4)" }}
        >
          <button
            onClick={() => setMacrosOpen((v) => !v)}
            className="flex items-center transition-opacity active:opacity-70"
            style={{
              gap: "var(--space-1)",
              fontSize: "var(--t-micro)",
              color: "var(--accent)",
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: 0,
            }}
          >
            {macrosOpen ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            Add macros
          </button>
          <button
            onClick={() => setIngredientsOpen((v) => !v)}
            className="flex items-center transition-opacity active:opacity-70"
            style={{
              gap: "var(--space-1)",
              fontSize: "var(--t-micro)",
              color: "var(--accent)",
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: 0,
            }}
          >
            {ingredientsOpen ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            Ingredients
          </button>
          <button
            type="button"
            onClick={handleReanalyze}
            disabled={(!logIngredients.trim() && !logDesc.trim()) || reanalyzing}
            className="flex items-center transition-opacity active:opacity-70 disabled:opacity-40"
            title={logIngredients.trim() ? "Estimate macros from ingredients" : "Estimate macros from dish name"}
            style={{
              gap: "var(--space-1)",
              fontSize: "var(--t-micro)",
              color: "var(--accent)",
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: 0,
            }}
          >
            {reanalyzing ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
            Estimate macros
          </button>
        </div>

        {ingredientsOpen && (
          <div style={{ marginTop: "var(--space-3)", paddingTop: "var(--space-3)", borderTop: "1px solid var(--rule-soft)" }}>
            <label style={{ display: "block", fontSize: "var(--t-micro)", color: "var(--color-text-muted)", marginBottom: "var(--space-1)" }}>
              Ingredients or modifications (optional)
            </label>
            <textarea
              value={logIngredients}
              onChange={(e) => setLogIngredients(e.target.value)}
              placeholder="e.g. &quot;added 4oz chicken&quot; or full list: &quot;6oz salmon, 1 cup rice, 1 tbsp oil&quot;"
              rows={3}
              style={{ ...inputStyle, fontSize: "var(--t-meta)", resize: "vertical", fontFamily: "inherit" }}
            />
          </div>
        )}

        {macrosOpen && (
          <div
            className="grid grid-cols-4"
            style={{
              gap: "var(--space-2)",
              marginTop: "var(--space-3)",
              paddingTop: "var(--space-3)",
              borderTop: "1px solid var(--rule-soft)",
            }}
          >
            {[
              { label: "Cal", value: logCal, setter: setLogCal, mode: "numeric" as const },
              { label: "P (g)", value: logProtein, setter: setLogProtein, mode: "decimal" as const },
              { label: "C (g)", value: logCarbs, setter: setLogCarbs, mode: "decimal" as const },
              { label: "F (g)", value: logFat, setter: setLogFat, mode: "decimal" as const },
            ].map(({ label, value, setter, mode }) => (
              <div key={label}>
                <label style={{ display: "block", fontSize: "var(--t-micro)", color: "var(--color-text-muted)", marginBottom: "var(--space-1)" }}>
                  {label}
                </label>
                <input
                  type="text"
                  inputMode={mode}
                  value={value}
                  onChange={(e) => setter(e.target.value)}
                  placeholder="0"
                  style={{ ...inputStyle, padding: "var(--space-2)", fontSize: "var(--t-meta)" }}
                />
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Recent meals (deduped past 7 days) */}
      {recentMeals.length > 0 && (
        <section>
          <h2 className="db-section-label">Recent meals</h2>
          <div>
            {recentMeals.map((m, i) => (
              <div
                key={m.id}
                style={i > 0 ? { borderTop: "1px solid var(--rule-soft)" } : {}}
              >
                <MealRowDisplay meal={m} onClick={() => prefillLog(m)} onRelog={() => prefillLog(m)} />
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Log via chat nudge — hairline row, no card */}
      <div
        className="flex items-center"
        style={{
          gap: "var(--space-3)",
          paddingTop: "var(--space-3)",
          paddingBottom: "var(--space-3)",
          borderTop: "1px solid var(--rule-soft)",
        }}
      >
        <MessageSquare size={15} style={{ color: "var(--accent)", flexShrink: 0 }} />
        <p style={{ fontSize: "var(--t-meta)", color: "var(--color-text-muted)" }}>
          Or ask{" "}
          <Link
            href="/chat"
            style={{ color: "var(--accent)", textDecoration: "underline", textUnderlineOffset: 2 }}
          >
            Mr. Bridge
          </Link>{" "}
          for meal ideas based on what you have on hand.
        </p>
      </div>
    </div>
  );
}

// ─── Recipes Tab ──────────────────────────────────────────────────────────────

function RecipesTab({ recipes }: { recipes: RecipeRow[] }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [useRecipeId, setUseRecipeId] = useState<string | null>(null);
  const [useRecipeMealType, setUseRecipeMealType] = useState<MealType>("lunch");
  const [logging, setLogging] = useState(false);

  const q = query.toLowerCase();
  const filtered = q
    ? recipes.filter((r) => {
        const haystack = [
          r.name,
          r.cuisine,
          ...(r.tags ?? []),
          r.ingredients ?? "",
        ]
          .join(" ")
          .toLowerCase();
        return haystack.includes(q);
      })
    : recipes;

  async function handleUseRecipe(recipeId: string) {
    setLogging(true);
    try {
      const recipe = recipes.find((r) => r.id === recipeId);
      const res = await fetch("/api/meals/log", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          meal_type: useRecipeMealType,
          recipe_id: recipeId,
          notes: recipe?.name ?? null,
        }),
      });
      if (!res.ok) throw new Error("Failed to log meal");
      setUseRecipeId(null);
      router.refresh();
    } finally {
      setLogging(false);
    }
  }

  return (
    <div className="flex flex-col" style={{ gap: "var(--space-5)" }}>
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search recipes, ingredients, tags…"
        style={inputStyle}
      />

      {filtered.length === 0 ? (
        <p
          style={{
            fontSize: "var(--t-body)",
            color: "var(--color-text-faint)",
            paddingTop: "var(--space-4)",
          }}
        >
          {recipes.length === 0 ? "No saved recipes yet." : "No recipes match your search."}
        </p>
      ) : (
        <div>
          {filtered.map((r, i) => {
            const isExpanded = expandedId === r.id;
            const isUsing = useRecipeId === r.id;
            return (
              <div
                key={r.id}
                className="card-lift"
                style={{
                  borderTop: i > 0 ? "1px solid var(--rule-soft)" : "none",
                  borderRadius: "var(--r-1)",
                  transition: "background var(--motion-fast) var(--ease-out-quart)",
                }}
              >
                <button
                  onClick={() => setExpandedId(isExpanded ? null : r.id)}
                  className="w-full text-left flex items-start justify-between"
                  style={{
                    gap: "var(--space-3)",
                    padding: "var(--space-3) 0",
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: "var(--t-body)", fontWeight: 600, color: "var(--color-text)" }}>
                      {r.name}
                    </p>
                    {r.cuisine && (
                      <p style={{ fontSize: "var(--t-micro)", color: "var(--color-text-muted)", marginTop: 2 }}>
                        {r.cuisine}
                      </p>
                    )}
                    {r.tags && r.tags.length > 0 && (
                      <div className="flex flex-wrap" style={{ gap: "var(--space-1)", marginTop: "var(--space-2)" }}>
                        {r.tags.map((tag) => (
                          <span
                            key={tag}
                            style={{
                              fontSize: "var(--t-micro)",
                              color: "var(--color-text-muted)",
                              border: "1px solid var(--rule-soft)",
                              borderRadius: "var(--r-1)",
                              padding: "2px var(--space-2)",
                            }}
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  {isExpanded ? (
                    <ChevronUp size={15} style={{ color: "var(--color-text-faint)", flexShrink: 0, marginTop: 4 }} />
                  ) : (
                    <ChevronDown size={15} style={{ color: "var(--color-text-faint)", flexShrink: 0, marginTop: 4 }} />
                  )}
                </button>

                {isExpanded && (
                  <div
                    style={{
                      padding: "var(--space-3) 0 var(--space-4)",
                      borderTop: "1px solid var(--rule-soft)",
                    }}
                  >
                    {r.ingredients && (
                      <p style={{ fontSize: "var(--t-meta)", color: "var(--color-text-muted)", lineHeight: 1.6, marginBottom: "var(--space-3)" }}>
                        {r.ingredients}
                      </p>
                    )}

                    {isUsing ? (
                      <div className="flex items-center flex-wrap" style={{ gap: "var(--space-2)" }}>
                        <select
                          value={useRecipeMealType}
                          onChange={(e) => setUseRecipeMealType(e.target.value as MealType)}
                          style={{ ...inputStyle, width: "auto", minWidth: 110 }}
                        >
                          {MEAL_TYPES.map((t) => (
                            <option key={t} value={t}>
                              {t.charAt(0).toUpperCase() + t.slice(1)}
                            </option>
                          ))}
                        </select>
                        <button
                          onClick={() => handleUseRecipe(r.id)}
                          disabled={logging}
                          className="flex items-center transition-opacity active:opacity-70 disabled:opacity-40"
                          style={{ ...ctaStyle, gap: "var(--space-1)" }}
                        >
                          {logging ? <Loader2 size={14} className="animate-spin" /> : "Log"}
                        </button>
                        <button
                          onClick={() => setUseRecipeId(null)}
                          style={{
                            fontSize: "var(--t-micro)",
                            color: "var(--color-text-muted)",
                            background: "none",
                            border: "none",
                            cursor: "pointer",
                            padding: "var(--space-1) var(--space-2)",
                          }}
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setUseRecipeId(r.id)}
                        className="transition-opacity active:opacity-70"
                        style={ctaStyle}
                      >
                        Use this recipe
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Plan Tab ─────────────────────────────────────────────────────────────────

function PlanTab({
  macroTotals,
  macroGoals,
}: {
  macroTotals: MacroTotals;
  macroGoals: MacroGoals;
}) {
  const router = useRouter();
  const [ingredients, setIngredients] = useState("");
  const [loading, setLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [error, setError] = useState("");
  const [logStates, setLogStates] = useState<Record<number, { open: boolean; mealType: MealType; logging: boolean }>>({});

  async function handleSuggest() {
    if (!ingredients.trim()) return;
    setLoading(true);
    setError("");
    setSuggestions([]);
    try {
      const res = await fetch("/api/meals/suggest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ingredients: ingredients.trim(),
          todayMacros: {
            calories: macroTotals.calories,
            protein_g: macroTotals.protein,
            carbs_g: macroTotals.carbs,
            fat_g: macroTotals.fat,
          },
          goals: {
            calories: macroGoals.calories,
            protein_g: macroGoals.protein,
            carbs_g: macroGoals.carbs,
            fat_g: macroGoals.fat,
          },
        }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error ?? "Failed to get suggestions");
      setSuggestions(data.suggestions ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to get suggestions");
    } finally {
      setLoading(false);
    }
  }

  function getLogState(i: number) {
    return logStates[i] ?? { open: false, mealType: "dinner" as MealType, logging: false };
  }

  function setLogState(i: number, update: Partial<{ open: boolean; mealType: MealType; logging: boolean }>) {
    setLogStates((prev) => ({
      ...prev,
      [i]: { ...getLogState(i), ...update },
    }));
  }

  async function handleLog(i: number, suggestion: Suggestion) {
    const state = getLogState(i);
    setLogState(i, { logging: true });
    try {
      const body: Record<string, string | number> = {
        meal_type: state.mealType,
        notes: suggestion.name,
        calories: suggestion.calories,
        protein_g: suggestion.protein_g,
        carbs_g: suggestion.carbs_g,
        fat_g: suggestion.fat_g,
      };
      if (suggestion.recipeId) body.recipe_id = suggestion.recipeId;

      const res = await fetch("/api/meals/log", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error("Failed to log meal");
      setLogState(i, { open: false, logging: false });
      router.refresh();
    } catch {
      setLogState(i, { logging: false });
    }
  }

  const remainingCal =
    macroGoals.calories != null ? macroGoals.calories - macroTotals.calories : null;
  const remainingProtein =
    macroGoals.protein != null ? macroGoals.protein - macroTotals.protein : null;

  return (
    <div className="flex flex-col" style={{ gap: "var(--space-6)" }}>
      <section>
        <h2 className="db-section-label">What do you have on hand?</h2>
        {(remainingCal != null || remainingProtein != null) && (
          <p
            className="tnum"
            style={{
              fontSize: "var(--t-micro)",
              color: "var(--color-text-faint)",
              marginBottom: "var(--space-2)",
            }}
          >
            Remaining today:{" "}
            {remainingCal != null && `${Math.max(0, remainingCal)} kcal`}
            {remainingCal != null && remainingProtein != null && " · "}
            {remainingProtein != null && `${Math.max(0, remainingProtein)}g protein`}
          </p>
        )}
        <textarea
          value={ingredients}
          onChange={(e) => setIngredients(e.target.value)}
          rows={3}
          placeholder="e.g. chicken breast, broccoli, rice"
          style={{ ...inputStyle, resize: "none", lineHeight: 1.6, marginBottom: "var(--space-3)" }}
        />
        <button
          onClick={handleSuggest}
          disabled={loading || !ingredients.trim()}
          className="flex items-center justify-center transition-opacity active:opacity-70 disabled:opacity-40"
          style={{
            ...ctaStyle,
            gap: "var(--space-2)",
            fontSize: "var(--t-body)",
            padding: "var(--space-3) var(--space-5)",
            width: "100%",
            cursor: loading || !ingredients.trim() ? "default" : "pointer",
          }}
        >
          {loading ? (
            <>
              <Loader2 size={15} className="animate-spin" />
              Finding suggestions…
            </>
          ) : (
            <>
              <RefreshCw size={15} />
              Get suggestions
            </>
          )}
        </button>
        {error && (
          <p style={{ fontSize: "var(--t-meta)", color: "var(--color-danger)", marginTop: "var(--space-3)" }}>
            {error}
          </p>
        )}
      </section>

      {suggestions.length > 0 && (
        <section>
          <h2 className="db-section-label">Suggestions</h2>
          <div>
            {suggestions.map((s, i) => {
              const state = getLogState(i);
              return (
                <div
                  key={i}
                  style={{
                    borderTop: i > 0 ? "1px solid var(--rule-soft)" : "none",
                    paddingTop: "var(--space-4)",
                    paddingBottom: "var(--space-4)",
                  }}
                >
                  {s.isSaved && (
                    <span
                      style={{
                        display: "inline-block",
                        marginBottom: "var(--space-2)",
                        fontSize: "var(--t-micro)",
                        color: "var(--color-positive)",
                        border: "1px solid var(--color-positive-subtle-strong)",
                        borderRadius: "var(--r-1)",
                        padding: "2px var(--space-2)",
                      }}
                    >
                      Saved recipe
                    </span>
                  )}
                  <p style={{ fontSize: "var(--t-body)", fontWeight: 600, color: "var(--color-text)", marginBottom: "var(--space-1)" }}>
                    {s.name}
                  </p>
                  <p style={{ fontSize: "var(--t-meta)", color: "var(--color-text-muted)", lineHeight: 1.5, marginBottom: "var(--space-2)" }}>
                    {s.description}
                  </p>
                  <div
                    className="flex tnum"
                    style={{
                      gap: "var(--space-4)",
                      marginBottom: "var(--space-3)",
                      fontSize: "var(--t-micro)",
                      color: "var(--color-text-faint)",
                    }}
                  >
                    <span>~{s.calories} cal</span>
                    <span>P {s.protein_g}g</span>
                    <span>C {s.carbs_g}g</span>
                    <span>F {s.fat_g}g</span>
                  </div>

                  {state.open ? (
                    <div className="flex items-center flex-wrap" style={{ gap: "var(--space-2)" }}>
                      <select
                        value={state.mealType}
                        onChange={(e) => setLogState(i, { mealType: e.target.value as MealType })}
                        style={{ ...inputStyle, width: "auto", minWidth: 110 }}
                      >
                        {MEAL_TYPES.map((t) => (
                          <option key={t} value={t}>
                            {t.charAt(0).toUpperCase() + t.slice(1)}
                          </option>
                        ))}
                      </select>
                      <button
                        onClick={() => handleLog(i, s)}
                        disabled={state.logging}
                        className="flex items-center transition-opacity active:opacity-70 disabled:opacity-40"
                        style={{ ...ctaStyle, gap: "var(--space-1)" }}
                      >
                        {state.logging ? <Loader2 size={14} className="animate-spin" /> : "Log"}
                      </button>
                      <button
                        onClick={() => setLogState(i, { open: false })}
                        style={{
                          fontSize: "var(--t-micro)",
                          color: "var(--color-text-muted)",
                          background: "none",
                          border: "none",
                          cursor: "pointer",
                          padding: "var(--space-1) var(--space-2)",
                        }}
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setLogState(i, { open: true })}
                      className="transition-opacity active:opacity-70"
                      style={ctaStyle}
                    >
                      Log this
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}

// ─── Root component ───────────────────────────────────────────────────────────

export default function MealsClient({
  todayMeals,
  pastMeals,
  recipes,
  macroGoals,
  macroTotals,
}: Props) {
  const [tab, setTab] = useState<Tab>("today");
  const [unsavedScanCount, setUnsavedScanCount] = useState(0);
  const [pendingTab, setPendingTab] = useState<Tab | null>(null);

  function handleTabClick(id: Tab) {
    if (id !== "scanner" && tab === "scanner" && unsavedScanCount > 0) {
      setPendingTab(id);
      return;
    }
    setTab(id);
  }

  function confirmLeave() {
    setUnsavedScanCount(0);
    if (pendingTab) {
      setTab(pendingTab);
      setPendingTab(null);
    }
  }

  function cancelLeave() {
    setPendingTab(null);
  }

  return (
    <div className="flex flex-col" style={{ gap: "var(--space-6)" }}>
      {/* Tab bar — pill style */}
      <div
        className="flex items-center"
        style={{
          gap: 2,
          padding: 2,
          borderRadius: "var(--r-2)",
          border: "1px solid var(--rule)",
          background: "transparent",
        }}
      >
        {TABS.map(({ id, label }) => {
          const active = tab === id;
          return (
            <button
              key={id}
              onClick={() => handleTabClick(id)}
              className="flex-1 transition-all duration-150"
              style={{
                padding: "var(--space-2) var(--space-3)",
                borderRadius: "var(--r-1)",
                fontSize: "var(--t-micro)",
                fontWeight: 500,
                background: active ? "var(--accent)" : "transparent",
                color: active ? "var(--color-text-on-cta)" : "var(--color-text-muted)",
                border: "none",
                cursor: "pointer",
              }}
            >
              {label}
            </button>
          );
        })}
      </div>

      {/* Navigation guard banner */}
      {pendingTab && unsavedScanCount > 0 && (
        <div
          className="flex items-center"
          style={{
            gap: "var(--space-3)",
            padding: "var(--space-3) var(--space-4)",
            borderRadius: "var(--r-2)",
            background: "var(--warning-subtle)",
            border: "1px solid var(--color-warning)",
            fontSize: "var(--t-meta)",
            color: "var(--color-text)",
          }}
        >
          <span style={{ flex: 1 }}>
            You have {unsavedScanCount} unsaved scan{unsavedScanCount !== 1 ? "s" : ""}.
          </span>
          <button
            onClick={cancelLeave}
            className="transition-opacity active:opacity-70"
            style={{
              ...ctaStyle,
              fontSize: "var(--t-micro)",
              padding: "var(--space-1) var(--space-3)",
              whiteSpace: "nowrap",
            }}
          >
            Keep scanning
          </button>
          <button
            onClick={confirmLeave}
            className="transition-opacity active:opacity-70"
            style={{
              ...ghostStyle,
              fontSize: "var(--t-micro)",
              padding: "var(--space-1) var(--space-3)",
              whiteSpace: "nowrap",
            }}
          >
            Discard and leave
          </button>
        </div>
      )}

      {/* Tab panels */}
      {tab === "today" && (
        <TodayTab
          todayMeals={todayMeals}
          pastMeals={pastMeals}
          macroGoals={macroGoals}
          macroTotals={macroTotals}
        />
      )}
      {tab === "recipes" && <RecipesTab recipes={recipes} />}
      {tab === "scanner" && (
        <FoodPhotoAnalyzer onUnsavedItems={(count) => setUnsavedScanCount(count)} />
      )}
      {tab === "plan" && (
        <PlanTab macroTotals={macroTotals} macroGoals={macroGoals} />
      )}

      {/* Past meals — always visible below the tabs */}
      {pastMeals.length > 0 && (
        <PastMeals pastMeals={pastMeals} />
      )}
    </div>
  );
}

// ─── Past Meals (below tabs, always visible) ──────────────────────────────────

function fmtDate(d: string) {
  return new Date(d + "T00:00:00").toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function PastMeals({ pastMeals }: { pastMeals: MealRow[] }) {
  const router = useRouter();
  const byDate = new Map<string, MealRow[]>();
  for (const meal of pastMeals) {
    if (!byDate.has(meal.date)) byDate.set(meal.date, []);
    byDate.get(meal.date)!.push(meal);
  }
  const dates = Array.from(byDate.keys());

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editFields, setEditFields] = useState<MealRowEditFields>({
    notes: "", meal_type: "breakfast", calories: "", protein_g: "", carbs_g: "", fat_g: "", fiber_g: "", sugar_g: "",
  });
  const [editSaving, setEditSaving] = useState(false);

  function startEdit(m: MealRow) {
    setEditingId(m.id);
    setEditFields({
      notes: m.notes ?? "",
      meal_type: m.meal_type,
      calories: m.calories != null ? String(m.calories) : "",
      protein_g: m.protein_g != null ? String(m.protein_g) : "",
      carbs_g: m.carbs_g != null ? String(m.carbs_g) : "",
      fat_g: m.fat_g != null ? String(m.fat_g) : "",
      fiber_g: m.fiber_g != null ? String(m.fiber_g) : "",
      sugar_g: m.sugar_g != null ? String(m.sugar_g) : "",
    });
  }

  async function saveEdit(id: string) {
    setEditSaving(true);
    await fetch("/api/meals/log", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id,
        notes: editFields.notes || null,
        meal_type: editFields.meal_type,
        calories: editFields.calories ? Number(editFields.calories) : null,
        protein_g: editFields.protein_g ? Number(editFields.protein_g) : null,
        carbs_g: editFields.carbs_g ? Number(editFields.carbs_g) : null,
        fat_g: editFields.fat_g ? Number(editFields.fat_g) : null,
        fiber_g: editFields.fiber_g ? Number(editFields.fiber_g) : null,
        sugar_g: editFields.sugar_g ? Number(editFields.sugar_g) : null,
      }),
    });
    setEditSaving(false);
    setEditingId(null);
    router.refresh();
  }

  return (
    <section style={{ paddingTop: "var(--space-5)", borderTop: "1px solid var(--rule)" }}>
      <h2 className="db-section-label">
        Past 6 Days
      </h2>
      <div className="flex flex-col" style={{ gap: "var(--space-5)" }}>
        {dates.map((date) => {
          const dayMeals = (byDate.get(date) ?? []).sort(
            (a, b) => (MEAL_ORDER[a.meal_type] ?? 9) - (MEAL_ORDER[b.meal_type] ?? 9)
          );
          return (
            <div key={date}>
              <p
                className="tnum"
                style={{
                  fontSize: "var(--t-micro)",
                  color: "var(--color-text-muted)",
                  letterSpacing: "0.04em",
                  marginBottom: "var(--space-2)",
                }}
              >
                {fmtDate(date)}
              </p>
              <div>
                {dayMeals.map((m, i) => (
                  <div
                    key={m.id}
                    style={i > 0 ? { borderTop: "1px solid var(--rule-soft)" } : {}}
                  >
                    {editingId === m.id ? (
                      <MealRowEdit
                        fields={editFields}
                        saving={editSaving}
                        onChange={setEditFields}
                        onSave={() => saveEdit(m.id)}
                        onCancel={() => setEditingId(null)}
                      />
                    ) : (
                      <MealRowDisplay meal={m} onClick={() => startEdit(m)} />
                    )}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
