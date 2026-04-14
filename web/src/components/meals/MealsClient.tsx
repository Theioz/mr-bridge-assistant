"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { MessageSquare, ChevronDown, ChevronUp, RefreshCw, Loader2 } from "lucide-react";
import Link from "next/link";
import FoodPhotoAnalyzer from "@/app/(protected)/meals/FoodPhotoAnalyzer";

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
}

export interface MacroTotals {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
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

// ─── Shared styles ────────────────────────────────────────────────────────────

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

function MacroBar({ label, unit, consumed, goal }: MacroBarProps) {
  if (goal === null) return null;
  const pct = goal > 0 ? (consumed / goal) * 100 : 0;
  const color = progressColor(pct);
  const remaining = goal - consumed;
  const isOver = remaining < 0;
  const clamped = Math.min(pct, 100);

  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between">
        <span style={{ fontSize: 13, fontWeight: 500, color: "var(--color-text)" }}>
          {label}
        </span>
        <div className="flex items-baseline gap-1.5">
          <span style={{ fontSize: 13, color: "var(--color-text)" }}>
            {consumed}
            <span style={{ color: "var(--color-text-muted)", fontSize: 11 }}>{unit}</span>
          </span>
          <span style={{ fontSize: 11, color: "var(--color-text-faint)" }}>/</span>
          <span style={{ fontSize: 11, color: "var(--color-text-muted)" }}>
            {goal}{unit}
          </span>
          <span style={{ fontSize: 11, fontWeight: 500, color, minWidth: 52, textAlign: "right" }}>
            {isOver
              ? `+${Math.abs(remaining)}${unit} over`
              : `${remaining}${unit} left`}
          </span>
        </div>
      </div>
      <div className="rounded-full overflow-hidden" style={{ height: 4, background: "var(--color-border)" }}>
        <div
          className="h-full rounded-full transition-all duration-300"
          style={{ width: `${clamped}%`, background: color }}
        />
      </div>
    </div>
  );
}

// ─── Today Tab ────────────────────────────────────────────────────────────────

function TodayTab({
  todayMeals,
  macroGoals,
  macroTotals,
}: {
  todayMeals: MealRow[];
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
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editFields, setEditFields] = useState<{
    notes: string; meal_type: string; calories: string; protein_g: string; carbs_g: string; fat_g: string;
  }>({ notes: "", meal_type: "breakfast", calories: "", protein_g: "", carbs_g: "", fat_g: "" });
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
      setMacrosOpen(false);
      router.refresh();
    } finally {
      setLogging(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* Macro summary */}
      {hasAnyGoal ? (
        <div
          className="rounded-xl p-5"
          style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)" }}
        >
          <p
            className="text-xs uppercase tracking-widest mb-4"
            style={{ color: "var(--color-text-muted)", letterSpacing: "0.07em" }}
          >
            Today&apos;s Macros
          </p>
          <div className="space-y-4">
            <MacroBar label="Calories" unit=" kcal" consumed={macroTotals.calories} goal={macroGoals.calories} />
            <MacroBar label="Protein" unit="g" consumed={macroTotals.protein} goal={macroGoals.protein} />
            <MacroBar label="Carbs" unit="g" consumed={macroTotals.carbs} goal={macroGoals.carbs} />
            <MacroBar label="Fat" unit="g" consumed={macroTotals.fat} goal={macroGoals.fat} />
          </div>
        </div>
      ) : (
        <div
          className="rounded-xl p-5"
          style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)" }}
        >
          <p style={{ fontSize: 14, color: "var(--color-text-muted)" }}>
            No nutrition goals set.{" "}
            <Link
              href="/settings"
              style={{ color: "var(--color-primary)", textDecoration: "underline", textUnderlineOffset: 2 }}
            >
              Configure goals in Settings
            </Link>{" "}
            to track progress here.
          </p>
        </div>
      )}

      {/* Today's logged meals */}
      <div
        className="rounded-xl p-5"
        style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)" }}
      >
        <p
          className="text-xs uppercase tracking-widest mb-4"
          style={{ color: "var(--color-text-muted)", letterSpacing: "0.07em" }}
        >
          Logged Today
        </p>

        {sortedMeals.length === 0 ? (
          <p style={{ fontSize: 14, color: "var(--color-text-faint)" }}>
            Nothing logged yet today.
          </p>
        ) : (
          <div className="space-y-2 mb-4">
            {sortedMeals.map((m) => {
              const hasMacros = m.calories != null || m.protein_g != null;
              const macroStr = hasMacros
                ? [
                    m.calories != null && `${m.calories} cal`,
                    m.protein_g != null && `P ${m.protein_g}g`,
                    m.carbs_g != null && `C ${m.carbs_g}g`,
                    m.fat_g != null && `F ${m.fat_g}g`,
                  ]
                    .filter(Boolean)
                    .join(" · ")
                : null;
              return (
                <div key={m.id}>
                  {editingId === m.id ? (
                    <div className="space-y-2 py-1">
                      <div className="flex gap-2">
                        <select
                          value={editFields.meal_type}
                          onChange={(e) => setEditFields((f) => ({ ...f, meal_type: e.target.value }))}
                          style={{ ...inputStyle, width: "auto", minWidth: 110, flexShrink: 0 }}
                        >
                          {MEAL_TYPES.map((t) => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
                        </select>
                        <input
                          type="text"
                          value={editFields.notes}
                          onChange={(e) => setEditFields((f) => ({ ...f, notes: e.target.value }))}
                          placeholder="Food name"
                          style={{ ...inputStyle, flex: 1 }}
                        />
                      </div>
                      <div className="flex gap-2">
                        {(["calories", "protein_g", "carbs_g", "fat_g"] as const).map((field) => (
                          <input
                            key={field}
                            type="number"
                            value={editFields[field]}
                            onChange={(e) => setEditFields((f) => ({ ...f, [field]: e.target.value }))}
                            placeholder={{ calories: "Cal", protein_g: "P(g)", carbs_g: "C(g)", fat_g: "F(g)" }[field]}
                            style={{ ...inputStyle, width: 68 }}
                          />
                        ))}
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => saveEdit(m.id)}
                          disabled={editSaving}
                          style={{ fontSize: 13, padding: "4px 12px", background: "var(--color-primary)", color: "var(--color-primary-foreground)", border: "none", borderRadius: 6, cursor: "pointer", opacity: editSaving ? 0.5 : 1 }}
                        >
                          {editSaving ? "Saving…" : "Save"}
                        </button>
                        <button
                          onClick={() => setEditingId(null)}
                          style={{ fontSize: 13, padding: "4px 12px", color: "var(--color-text-muted)", background: "none", border: "none", cursor: "pointer" }}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div
                      className="flex items-baseline gap-3"
                      onClick={() => startEdit(m)}
                      style={{ cursor: "pointer" }}
                    >
                      <span
                        style={{
                          fontSize: 11,
                          fontWeight: 500,
                          color: "var(--color-text-muted)",
                          textTransform: "capitalize",
                          minWidth: 64,
                        }}
                      >
                        {m.meal_type}
                      </span>
                      <div>
                        <span style={{ fontSize: 14, color: "var(--color-text)" }}>
                          {m.recipes?.name ?? m.notes ?? "—"}
                        </span>
                        {macroStr && (
                          <span style={{ fontSize: 11, color: "var(--color-text-faint)", marginLeft: 8 }}>
                            {macroStr}
                          </span>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Divider */}
        <div style={{ borderTop: "1px solid var(--color-border)", marginBottom: 14 }} />

        {/* Quick-log form */}
        <p
          className="text-xs uppercase tracking-widest mb-3"
          style={{ color: "var(--color-text-faint)", letterSpacing: "0.07em" }}
        >
          Quick log
        </p>
        <div className="flex gap-2 mb-2">
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
            onClick={handleLog}
            disabled={logging || !logDesc.trim()}
            className="flex items-center justify-center rounded-xl font-medium transition-opacity active:opacity-70 disabled:opacity-40"
            style={{
              background: "var(--color-primary)",
              color: "#fff",
              fontSize: 14,
              padding: "10px 14px",
              whiteSpace: "nowrap",
              flexShrink: 0,
            }}
          >
            {logging ? <Loader2 size={14} className="animate-spin" /> : "Log"}
          </button>
        </div>

        <button
          onClick={() => setMacrosOpen((v) => !v)}
          className="flex items-center gap-1 transition-opacity active:opacity-70"
          style={{ fontSize: 12, color: "var(--color-primary)", background: "none", border: "none", cursor: "pointer", padding: "2px 0" }}
        >
          {macrosOpen ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          Add macros
        </button>

        {macrosOpen && (
          <div
            className="grid grid-cols-4 gap-2 mt-3 pt-3"
            style={{ borderTop: "1px solid var(--color-border)" }}
          >
            {[
              { label: "Cal", value: logCal, setter: setLogCal, mode: "numeric" as const },
              { label: "P (g)", value: logProtein, setter: setLogProtein, mode: "decimal" as const },
              { label: "C (g)", value: logCarbs, setter: setLogCarbs, mode: "decimal" as const },
              { label: "F (g)", value: logFat, setter: setLogFat, mode: "decimal" as const },
            ].map(({ label, value, setter, mode }) => (
              <div key={label}>
                <label style={{ display: "block", fontSize: 11, color: "var(--color-text-muted)", marginBottom: 4 }}>
                  {label}
                </label>
                <input
                  type="text"
                  inputMode={mode}
                  value={value}
                  onChange={(e) => setter(e.target.value)}
                  placeholder="0"
                  style={{ ...inputStyle, padding: "7px 8px", fontSize: 13 }}
                />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Log via chat nudge */}
      <div
        className="flex items-center gap-3 rounded-xl px-4 py-3"
        style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)" }}
      >
        <MessageSquare size={16} style={{ color: "var(--color-primary)", flexShrink: 0 }} />
        <p style={{ fontSize: 14, color: "var(--color-text-muted)" }}>
          Or ask{" "}
          <Link
            href="/chat"
            style={{ color: "var(--color-primary)", textDecoration: "underline", textUnderlineOffset: 2 }}
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
    <div className="space-y-3">
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search recipes, ingredients, tags…"
        style={inputStyle}
      />

      {filtered.length === 0 ? (
        <div
          className="rounded-xl p-8 text-center"
          style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)" }}
        >
          <p style={{ fontSize: 14, color: "var(--color-text-faint)" }}>
            {recipes.length === 0 ? "No saved recipes yet." : "No recipes match your search."}
          </p>
        </div>
      ) : (
        filtered.map((r) => {
          const isExpanded = expandedId === r.id;
          const isUsing = useRecipeId === r.id;
          return (
            <div
              key={r.id}
              className="rounded-xl overflow-hidden"
              style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)" }}
            >
              <button
                onClick={() => setExpandedId(isExpanded ? null : r.id)}
                className="w-full text-left px-4 py-4 flex items-start justify-between gap-3"
                style={{ background: "none", border: "none", cursor: "pointer" }}
              >
                <div>
                  <p style={{ fontSize: 14, fontWeight: 600, color: "var(--color-text)" }}>
                    {r.name}
                  </p>
                  {r.cuisine && (
                    <p style={{ fontSize: 12, color: "var(--color-text-muted)", marginTop: 2 }}>
                      {r.cuisine}
                    </p>
                  )}
                  {r.tags && r.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {r.tags.map((tag) => (
                        <span
                          key={tag}
                          className="rounded-full px-2 py-0.5"
                          style={{
                            fontSize: 11,
                            background: "color-mix(in srgb, var(--color-primary) 12%, transparent)",
                            color: "var(--color-primary)",
                          }}
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                {isExpanded ? (
                  <ChevronUp size={15} style={{ color: "var(--color-text-faint)", flexShrink: 0, marginTop: 2 }} />
                ) : (
                  <ChevronDown size={15} style={{ color: "var(--color-text-faint)", flexShrink: 0, marginTop: 2 }} />
                )}
              </button>

              {isExpanded && (
                <div
                  className="px-4 pb-4 pt-1"
                  style={{ borderTop: "1px solid var(--color-border)" }}
                >
                  {r.ingredients && (
                    <p style={{ fontSize: 13, color: "var(--color-text-muted)", lineHeight: 1.6, marginBottom: 12 }}>
                      {r.ingredients}
                    </p>
                  )}

                  {isUsing ? (
                    <div className="flex items-center gap-2">
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
                        className="flex items-center gap-1.5 rounded-xl font-medium transition-opacity active:opacity-70 disabled:opacity-40"
                        style={{
                          background: "var(--color-primary)",
                          color: "#fff",
                          fontSize: 14,
                          padding: "10px 14px",
                        }}
                      >
                        {logging ? <Loader2 size={14} className="animate-spin" /> : "Log"}
                      </button>
                      <button
                        onClick={() => setUseRecipeId(null)}
                        style={{ fontSize: 13, color: "var(--color-text-muted)", background: "none", border: "none", cursor: "pointer" }}
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setUseRecipeId(r.id)}
                      className="rounded-xl font-medium transition-opacity active:opacity-70"
                      style={{
                        background: "var(--color-primary)",
                        color: "#fff",
                        fontSize: 14,
                        padding: "9px 16px",
                        border: "none",
                        cursor: "pointer",
                      }}
                    >
                      Use this recipe
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })
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
    <div className="space-y-4">
      <div
        className="rounded-xl p-5"
        style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)" }}
      >
        <p
          className="text-xs uppercase tracking-widest mb-3"
          style={{ color: "var(--color-text-muted)", letterSpacing: "0.07em" }}
        >
          What do you have on hand?
        </p>
        {(remainingCal != null || remainingProtein != null) && (
          <p style={{ fontSize: 12, color: "var(--color-text-faint)", marginBottom: 10 }}>
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
          style={{ ...inputStyle, resize: "none", lineHeight: 1.6, marginBottom: 10 }}
        />
        <button
          onClick={handleSuggest}
          disabled={loading || !ingredients.trim()}
          className="flex items-center justify-center gap-2 rounded-xl font-medium transition-opacity active:opacity-70 disabled:opacity-40"
          style={{
            background: "var(--color-primary)",
            color: "#fff",
            fontSize: 15,
            padding: "12px 20px",
            width: "100%",
            border: "none",
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
          <p style={{ fontSize: 13, color: "var(--color-danger, #ef4444)", marginTop: 10 }}>
            {error}
          </p>
        )}
      </div>

      {suggestions.length > 0 && (
        <div className="space-y-3">
          {suggestions.map((s, i) => {
            const state = getLogState(i);
            return (
              <div
                key={i}
                className="rounded-xl p-4"
                style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)" }}
              >
                {s.isSaved && (
                  <span
                    className="rounded-full px-2 py-0.5 inline-block mb-2"
                    style={{
                      fontSize: 11,
                      background: "color-mix(in srgb, var(--color-positive) 15%, transparent)",
                      color: "var(--color-positive)",
                    }}
                  >
                    Saved recipe
                  </span>
                )}
                <p style={{ fontSize: 15, fontWeight: 600, color: "var(--color-text)", marginBottom: 4 }}>
                  {s.name}
                </p>
                <p style={{ fontSize: 13, color: "var(--color-text-muted)", lineHeight: 1.5, marginBottom: 10 }}>
                  {s.description}
                </p>
                <div className="flex gap-4 mb-3" style={{ fontSize: 12, color: "var(--color-text-faint)" }}>
                  <span>~{s.calories} cal</span>
                  <span>P {s.protein_g}g</span>
                  <span>C {s.carbs_g}g</span>
                  <span>F {s.fat_g}g</span>
                </div>

                {state.open ? (
                  <div className="flex items-center gap-2">
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
                      className="flex items-center gap-1.5 rounded-xl font-medium transition-opacity active:opacity-70 disabled:opacity-40"
                      style={{
                        background: "var(--color-primary)",
                        color: "#fff",
                        fontSize: 14,
                        padding: "10px 14px",
                        border: "none",
                        cursor: "pointer",
                      }}
                    >
                      {state.logging ? <Loader2 size={14} className="animate-spin" /> : "Log"}
                    </button>
                    <button
                      onClick={() => setLogState(i, { open: false })}
                      style={{ fontSize: 13, color: "var(--color-text-muted)", background: "none", border: "none", cursor: "pointer" }}
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setLogState(i, { open: true })}
                    className="rounded-xl font-medium transition-opacity active:opacity-70"
                    style={{
                      background: "var(--color-primary)",
                      color: "#fff",
                      fontSize: 14,
                      padding: "9px 16px",
                      border: "none",
                      cursor: "pointer",
                    }}
                  >
                    Log this
                  </button>
                )}
              </div>
            );
          })}
        </div>
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

  return (
    <div className="space-y-5">
      {/* Tab bar — pill style matching GranularityToggle */}
      <div
        className="flex items-center gap-0.5 p-0.5 rounded-lg"
        style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)" }}
      >
        {TABS.map(({ id, label }) => {
          const active = tab === id;
          return (
            <button
              key={id}
              onClick={() => setTab(id)}
              className="flex-1 px-2.5 py-1.5 rounded-md text-xs font-medium transition-all duration-150"
              style={{
                background: active ? "var(--color-primary)" : "transparent",
                color: active ? "#fff" : "var(--color-text-muted)",
                border: "none",
                cursor: "pointer",
              }}
            >
              {label}
            </button>
          );
        })}
      </div>

      {/* Tab panels */}
      {tab === "today" && (
        <TodayTab
          todayMeals={todayMeals}
          macroGoals={macroGoals}
          macroTotals={macroTotals}
        />
      )}
      {tab === "recipes" && <RecipesTab recipes={recipes} />}
      {tab === "scanner" && <FoodPhotoAnalyzer />}
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
  const [editFields, setEditFields] = useState<{
    notes: string; meal_type: string; calories: string; protein_g: string; carbs_g: string; fat_g: string;
  }>({ notes: "", meal_type: "breakfast", calories: "", protein_g: "", carbs_g: "", fat_g: "" });
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
      }),
    });
    setEditSaving(false);
    setEditingId(null);
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <p
        className="text-xs uppercase tracking-widest"
        style={{ color: "var(--color-text-faint)", letterSpacing: "0.07em" }}
      >
        Past 6 Days
      </p>
      {dates.map((date) => {
        const dayMeals = (byDate.get(date) ?? []).sort(
          (a, b) => (MEAL_ORDER[a.meal_type] ?? 9) - (MEAL_ORDER[b.meal_type] ?? 9)
        );
        return (
          <div
            key={date}
            className="rounded-xl p-5"
            style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)" }}
          >
            <p
              className="text-xs uppercase tracking-widest mb-3"
              style={{ color: "var(--color-text-muted)", letterSpacing: "0.07em" }}
            >
              {fmtDate(date)}
            </p>
            <div className="space-y-2">
              {dayMeals.map((m) => {
                const hasMacros = m.calories != null || m.protein_g != null;
                const macroStr = hasMacros
                  ? [
                      m.calories != null && `${m.calories} cal`,
                      m.protein_g != null && `P ${m.protein_g}g`,
                      m.carbs_g != null && `C ${m.carbs_g}g`,
                      m.fat_g != null && `F ${m.fat_g}g`,
                    ]
                      .filter(Boolean)
                      .join(" · ")
                  : null;
                return (
                  <div key={m.id}>
                    {editingId === m.id ? (
                      <div className="space-y-2 py-1">
                        <div className="flex gap-2">
                          <select
                            value={editFields.meal_type}
                            onChange={(e) => setEditFields((f) => ({ ...f, meal_type: e.target.value }))}
                            style={{ ...inputStyle, width: "auto", minWidth: 110, flexShrink: 0 }}
                          >
                            {MEAL_TYPES.map((t) => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
                          </select>
                          <input
                            type="text"
                            value={editFields.notes}
                            onChange={(e) => setEditFields((f) => ({ ...f, notes: e.target.value }))}
                            placeholder="Food name"
                            style={{ ...inputStyle, flex: 1 }}
                          />
                        </div>
                        <div className="flex gap-2">
                          {(["calories", "protein_g", "carbs_g", "fat_g"] as const).map((field) => (
                            <input
                              key={field}
                              type="number"
                              value={editFields[field]}
                              onChange={(e) => setEditFields((f) => ({ ...f, [field]: e.target.value }))}
                              placeholder={{ calories: "Cal", protein_g: "P(g)", carbs_g: "C(g)", fat_g: "F(g)" }[field]}
                              style={{ ...inputStyle, width: 68 }}
                            />
                          ))}
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => saveEdit(m.id)}
                            disabled={editSaving}
                            style={{ fontSize: 13, padding: "4px 12px", background: "var(--color-primary)", color: "var(--color-primary-foreground)", border: "none", borderRadius: 6, cursor: "pointer", opacity: editSaving ? 0.5 : 1 }}
                          >
                            {editSaving ? "Saving…" : "Save"}
                          </button>
                          <button
                            onClick={() => setEditingId(null)}
                            style={{ fontSize: 13, padding: "4px 12px", color: "var(--color-text-muted)", background: "none", border: "none", cursor: "pointer" }}
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div
                        className="flex items-baseline gap-3"
                        onClick={() => startEdit(m)}
                        style={{ cursor: "pointer" }}
                      >
                        <span
                          style={{
                            fontSize: 11,
                            fontWeight: 500,
                            color: "var(--color-text-muted)",
                            textTransform: "capitalize",
                            minWidth: 64,
                          }}
                        >
                          {m.meal_type}
                        </span>
                        <div>
                          <span style={{ fontSize: 14, color: "var(--color-text)" }}>
                            {m.recipes?.name ?? m.notes ?? "—"}
                          </span>
                          {macroStr && (
                            <span style={{ fontSize: 11, color: "var(--color-text-faint)", marginLeft: 8 }}>
                              {macroStr}
                            </span>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
