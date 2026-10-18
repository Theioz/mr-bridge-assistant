"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw, Loader2 } from "lucide-react";
import type { MacroGoals, MacroTotals } from "@/lib/nutrition/daily-macros";
import { MEAL_TYPES, ctaStyle, inputStyle, type MealType } from "./meals-shared";

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

// ─── Plan Tab ─────────────────────────────────────────────────────────────────

export function PlanTab({
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
  const [logStates, setLogStates] = useState<
    Record<number, { open: boolean; mealType: MealType; logging: boolean }>
  >({});

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

  function setLogState(
    i: number,
    update: Partial<{ open: boolean; mealType: MealType; logging: boolean }>,
  ) {
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
            Remaining today: {remainingCal != null && `${Math.max(0, remainingCal)} kcal`}
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
          <p
            style={{
              fontSize: "var(--t-meta)",
              color: "var(--color-danger)",
              marginTop: "var(--space-3)",
            }}
          >
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
                  <p
                    style={{
                      fontSize: "var(--t-body)",
                      fontWeight: 600,
                      color: "var(--color-text)",
                      marginBottom: "var(--space-1)",
                    }}
                  >
                    {s.name}
                  </p>
                  <p
                    style={{
                      fontSize: "var(--t-meta)",
                      color: "var(--color-text-muted)",
                      lineHeight: 1.5,
                      marginBottom: "var(--space-2)",
                    }}
                  >
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
                        aria-label="Meal type"
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
