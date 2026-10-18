"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronUp, RefreshCw, Loader2 } from "lucide-react";
import Link from "next/link";
import type { MacroGoals, MacroTotals } from "@/lib/nutrition/daily-macros";
import { LabelLog } from "./LabelLog";
import { MacroBars, SugarTotalRow } from "./MacroBars";
import { MealRowDisplay, MealRowEdit, type MealRowEditFields } from "./MealRows";
import {
  MEAL_ORDER,
  MEAL_TYPES,
  ctaStyle,
  inputStyle,
  type MealRow,
  type MealType,
} from "./meals-shared";

// ─── Today Tab ────────────────────────────────────────────────────────────────

export function TodayTab({
  todayMeals,
  macroGoals,
  macroTotals,
  onDelete,
}: {
  todayMeals: MealRow[];
  macroGoals: MacroGoals;
  macroTotals: MacroTotals;
  onDelete: (id: string) => void;
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
  const [labelOpen, setLabelOpen] = useState(false);
  const [logIngredients, setLogIngredients] = useState("");
  const logSaveRef = useRef<HTMLButtonElement>(null);
  const quickLogRef = useRef<HTMLDivElement>(null);

  function prefillLog(m: MealRow) {
    const name = m.cooks?.name ?? m.recipes?.name ?? m.notes ?? "";
    setLogDesc(name);
    setLogMealType(
      (MEAL_TYPES as readonly string[]).includes(m.meal_type)
        ? (m.meal_type as MealType)
        : "breakfast",
    );
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

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editFields, setEditFields] = useState<MealRowEditFields>({
    notes: "",
    meal_type: "breakfast",
    calories: "",
    protein_g: "",
    carbs_g: "",
    fat_g: "",
    fiber_g: "",
    sugar_g: "",
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
    (a, b) => (MEAL_ORDER[a.meal_type] ?? 9) - (MEAL_ORDER[b.meal_type] ?? 9),
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
            <MacroBars totals={macroTotals} goals={macroGoals} />
            <SugarTotalRow sugar={macroTotals.sugar} />
          </div>
        ) : (
          <p style={{ fontSize: "var(--t-body)", color: "var(--color-text-muted)" }}>
            No nutrition goals set.{" "}
            <Link
              href="/settings"
              style={{
                color: "var(--accent-text)",
                textDecoration: "underline",
                textUnderlineOffset: 2,
              }}
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
              <div key={m.id} style={i > 0 ? { borderTop: "1px solid var(--rule-soft)" } : {}}>
                {editingId === m.id ? (
                  <MealRowEdit
                    fields={editFields}
                    saving={editSaving}
                    onChange={setEditFields}
                    onSave={() => saveEdit(m.id)}
                    onCancel={() => setEditingId(null)}
                  />
                ) : (
                  <MealRowDisplay
                    meal={m}
                    onClick={() => startEdit(m)}
                    onRelog={() => prefillLog(m)}
                    onDelete={() => onDelete(m.id)}
                  />
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
            aria-label="Meal type"
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
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) handleLog();
            }}
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

        <div className="flex items-center flex-wrap" style={{ gap: "var(--space-4)" }}>
          <button
            onClick={() => setMacrosOpen((v) => !v)}
            className="flex items-center transition-opacity active:opacity-70"
            style={{
              gap: "var(--space-1)",
              fontSize: "var(--t-micro)",
              color: "var(--accent-text)",
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
              color: "var(--accent-text)",
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
            title={
              logIngredients.trim()
                ? "Estimate macros from ingredients"
                : "Estimate macros from dish name"
            }
            style={{
              gap: "var(--space-1)",
              fontSize: "var(--t-micro)",
              color: "var(--accent-text)",
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: 0,
            }}
          >
            {reanalyzing ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
            Estimate macros
          </button>
          <button
            onClick={() => setLabelOpen((v) => !v)}
            className="flex items-center transition-opacity active:opacity-70"
            style={{
              gap: "var(--space-1)",
              fontSize: "var(--t-micro)",
              color: "var(--accent-text)",
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: 0,
            }}
          >
            {labelOpen ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            From a label
          </button>
        </div>

        {labelOpen && (
          <div
            style={{
              marginTop: "var(--space-3)",
              paddingTop: "var(--space-3)",
              borderTop: "1px solid var(--rule-soft)",
            }}
          >
            <LabelLog mealType={logMealType} />
          </div>
        )}

        {ingredientsOpen && (
          <div
            style={{
              marginTop: "var(--space-3)",
              paddingTop: "var(--space-3)",
              borderTop: "1px solid var(--rule-soft)",
            }}
          >
            <label
              style={{
                display: "block",
                fontSize: "var(--t-micro)",
                color: "var(--color-text-muted)",
                marginBottom: "var(--space-1)",
              }}
            >
              Ingredients or modifications (optional)
            </label>
            <textarea
              value={logIngredients}
              onChange={(e) => setLogIngredients(e.target.value)}
              placeholder='e.g. "added 4oz chicken" or full list: "6oz salmon, 1 cup rice, 1 tbsp oil"'
              rows={3}
              style={{
                ...inputStyle,
                fontSize: "var(--t-meta)",
                resize: "vertical",
                fontFamily: "inherit",
              }}
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
              {
                label: "P (g)",
                value: logProtein,
                setter: setLogProtein,
                mode: "decimal" as const,
              },
              { label: "C (g)", value: logCarbs, setter: setLogCarbs, mode: "decimal" as const },
              { label: "F (g)", value: logFat, setter: setLogFat, mode: "decimal" as const },
            ].map(({ label, value, setter, mode }) => (
              <div key={label}>
                <label
                  style={{
                    display: "block",
                    fontSize: "var(--t-micro)",
                    color: "var(--color-text-muted)",
                    marginBottom: "var(--space-1)",
                  }}
                >
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
    </div>
  );
}
