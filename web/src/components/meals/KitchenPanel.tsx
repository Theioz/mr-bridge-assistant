"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PlannedMealDetail } from "./PlannedMealDetail";
import CookItDialog from "./CookItDialog";
import type { RecipeIngredient, RecipeStep } from "@/lib/types";

/**
 * The kitchen: what's planned today, and what's already in the fridge.
 *
 * This panel exists to make logging a prepped meal cost ONE TAP. Before it, every meal — even
 * one you cooked yourself from a saved recipe on Sunday — required a photo, a local-model
 * parse and a USDA round trip. Three of those a day is why meal logging stopped in May after
 * three weeks.
 *
 * The macros are already known here (USDA-derived at cook time), so eating is a confirmation,
 * not an analysis. The photo analyzer stays exactly where it is, for the off-plan food it is
 * actually good at.
 */

export interface KitchenCook {
  id: string;
  name: string;
  cooked_on: string;
  portions: number;
  portions_remaining: number;
  calories: number | null;
  protein_g: number | null;
}

export interface KitchenPlannedMeal {
  id: string;
  date: string;
  meal_type: string;
  portions: number;
  status: string;
  name: string | null;
  // macros_computed_at distinguishes a real recipe from a name-only stub: only a resolved
  // recipe can be cooked-and-logged in one tap. The rest feeds the click-in detail view —
  // ingredients and macros are surfaced there so a plan isn't just an opaque label.
  recipes: {
    id: string;
    name: string;
    ingredients: string | null;
    instructions: string | null;
    ingredients_json: RecipeIngredient[] | null;
    steps_json: RecipeStep[] | null;
    calories: number | null;
    protein_g: number | null;
    carbs_g: number | null;
    fat_g: number | null;
    fiber_g: number | null;
    typical_portions: number | null;
    macros_confidence: string | null;
    macros_computed_at: string | null;
  } | null;
  cooks: {
    id: string;
    name: string;
    portions: number;
    portions_remaining: number;
    calories: number | null;
    protein_g: number | null;
    carbs_g: number | null;
    fat_g: number | null;
    fiber_g: number | null;
  } | null;
}

interface KitchenPanelProps {
  leftovers: KitchenCook[];
  plan: KitchenPlannedMeal[];
}

const MEAL_ORDER = ["breakfast", "lunch", "dinner", "snack"];

function perPortion(total: number | null, portions: number): number | null {
  if (total == null || portions < 1) return null;
  return Math.round(total / portions);
}

function daysAgo(dateStr: string): number {
  const then = new Date(`${dateStr}T00:00:00`);
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return Math.round((now.getTime() - then.getTime()) / 86_400_000);
}

// Leftovers have a shelf life, and a plan that tells you to eat five-day-old chicken has
// failed. Flag age rather than hiding it — the user decides what's still good.
function ageLabel(dateStr: string): { text: string; stale: boolean } {
  const d = daysAgo(dateStr);
  if (d <= 0) return { text: "cooked today", stale: false };
  if (d === 1) return { text: "cooked yesterday", stale: false };
  return { text: `cooked ${d} days ago`, stale: d >= 4 };
}

export function KitchenPanel({ leftovers, plan }: KitchenPanelProps) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // The recipe whose "Cooked it" sheet is open. A batch is cooked once and eaten over days,
  // so recording the cook is a separate act from logging a serving of it.
  const [cookingRecipe, setCookingRecipe] = useState<{
    id: string;
    name: string;
    portions: number;
  } | null>(null);

  // Data comes from the server component, so "Ate this" just needs to invalidate it:
  // router.refresh() re-runs the page query, which updates the fridge AND the macro
  // totals card above us in one pass. No local cache to keep in sync.
  async function eat(cookId: string, opts: { mealType?: string; mealPlanId?: string }) {
    setBusyId(opts.mealPlanId ?? cookId);
    setError(null);
    try {
      const res = await fetch("/api/meals/eat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cook_id: cookId,
          portions: 1,
          meal_type: opts.mealType,
          meal_plan_id: opts.mealPlanId,
        }),
      });
      if (!res.ok) {
        setError((await res.json()).error ?? "Couldn't log that");
        return;
      }
      router.refresh();
    } catch {
      setError("Couldn't log that");
    } finally {
      setBusyId(null);
    }
  }

  // Eat a recipe-backed plan: cook the recipe and eat a portion in one tap. Unlike `mark`
  // below, this DOES log macros — the recipe's are known — so a planned meal you actually made
  // stops being invisible in the day's totals. Same endpoint as `eat`, keyed on recipe_id.
  async function eatRecipe(recipeId: string, opts: { mealType?: string; mealPlanId: string }) {
    setBusyId(opts.mealPlanId);
    setError(null);
    try {
      const res = await fetch("/api/meals/eat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recipe_id: recipeId,
          portions: 1,
          meal_type: opts.mealType,
          meal_plan_id: opts.mealPlanId,
        }),
      });
      if (!res.ok) {
        setError((await res.json()).error ?? "Couldn't log that");
        return;
      }
      router.refresh();
    } catch {
      setError("Couldn't log that");
    } finally {
      setBusyId(null);
    }
  }

  // Outcome without macros. The two `eat*` handlers above log known numbers into meal_log; this
  // is the fallback for a plan that has none to log — freeform text ("dinner out"), or a recipe
  // that is still a name-only stub. Those could previously be neither confirmed nor declined.
  // Things don't go to plan; the plan has to be able to hear about it.
  async function mark(planId: string, status: "eaten" | "skipped") {
    setBusyId(planId);
    setError(null);
    try {
      const res = await fetch("/api/meal-plan", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: planId, status }),
      });
      if (!res.ok) {
        setError((await res.json()).error ?? "Couldn't update that");
        return;
      }
      router.refresh();
    } catch {
      setError("Couldn't update that");
    } finally {
      setBusyId(null);
    }
  }

  const todaysPlan = plan
    .filter((p) => p.status === "planned")
    .sort((a, b) => MEAL_ORDER.indexOf(a.meal_type) - MEAL_ORDER.indexOf(b.meal_type));

  // Nothing planned and nothing in the fridge — say nothing rather than show an empty box.
  if (!todaysPlan.length && !leftovers.length) return null;

  return (
    <section style={{ marginBottom: "var(--space-6)" }}>
      {/* Portalled, so it renders here regardless of where in the list it was opened from.
          Keyed on the recipe so reopening for a different one remounts with fresh state
          rather than showing the previous recipe's plan for a frame. */}
      {cookingRecipe ? (
        <CookItDialog
          key={cookingRecipe.id}
          recipeId={cookingRecipe.id}
          recipeName={cookingRecipe.name}
          defaultPortions={cookingRecipe.portions}
          open
          onOpenChange={(o) => {
            if (!o) setCookingRecipe(null);
          }}
          onCooked={() => router.refresh()}
        />
      ) : null}
      <h2
        className="font-heading font-semibold"
        style={{
          fontSize: "var(--t-h3)",
          color: "var(--color-text)",
          marginBottom: "var(--space-1)",
        }}
      >
        Your kitchen
      </h2>
      <p
        style={{
          fontSize: "var(--t-micro)",
          color: "var(--color-text-muted)",
          marginBottom: "var(--space-4)",
        }}
      >
        Macros are already known — logging these is one tap, no photo.
      </p>

      {error && (
        <p
          style={{
            fontSize: "var(--t-micro)",
            color: "var(--color-danger)",
            marginBottom: "var(--space-3)",
          }}
        >
          {error}
        </p>
      )}

      {todaysPlan.length > 0 && (
        <div style={{ marginBottom: leftovers.length ? "var(--space-5)" : 0 }}>
          <p style={labelStyle}>Planned today</p>
          {todaysPlan.map((p) => {
            const cook = p.cooks;
            const label = cook?.name ?? p.recipes?.name ?? p.name ?? "Meal";
            const canEat = !!cook && cook.portions_remaining > 0;
            // A recipe with resolved macros can be cooked-and-logged in one tap. A name-only
            // stub (macros_computed_at null) can't — it falls through to the status-only path.
            const recipe = p.recipes;
            const canEatRecipe = !cook && !!recipe && !!recipe.macros_computed_at;
            const expanded = expandedId === p.id;
            return (
              <div key={p.id}>
                <div style={rowStyle}>
                  <button
                    type="button"
                    onClick={() => setExpandedId(expanded ? null : p.id)}
                    aria-expanded={expanded}
                    style={expanderStyle}
                  >
                    <span style={caretStyle}>{expanded ? "▾" : "▸"}</span>
                    <span style={{ minWidth: 0 }}>
                      <span style={nameStyle}>{label}</span>
                      <span style={subStyle}>
                        {p.meal_type}
                        {canEatRecipe ? " · from recipe" : ""}
                        {/* The consequence is stated INLINE, not only in the button's title.
                            This panel is used from the installed PWA on a phone, where a title
                            attribute never appears, so on touch the difference between logging a
                            meal and merely flagging it was one word ("Ate this" vs "Ate it"). */}
                        {!cook && recipe && !recipe.macros_computed_at
                          ? " · needs cooking — logs no macros"
                          : ""}
                        {!cook && !recipe ? " · tap for amounts" : ""}
                      </span>
                    </span>
                  </button>
                  <div style={{ display: "flex", gap: "var(--space-2)", flexShrink: 0 }}>
                    {canEat ? (
                      // Cook-backed: log the known macros AND decrement the fridge.
                      <button
                        type="button"
                        disabled={busyId === p.id}
                        onClick={() => eat(cook.id, { mealType: p.meal_type, mealPlanId: p.id })}
                        style={eatButtonStyle(busyId === p.id)}
                      >
                        {busyId === p.id ? "Logging…" : "Ate this"}
                      </button>
                    ) : canEatRecipe ? (
                      <>
                        {/* Cooking a batch and eating a serving of it are different events, and
                          only the first one spends raw ingredients. "Cooked it" records the
                          batch and draws the kitchen down; "Ate this" below still bundles both
                          for the single-serving case, and deliberately draws nothing — it has
                          no confirmation step, and an unconfirmed draw is the failure mode this
                          whole feature exists to avoid. */}
                        <button
                          type="button"
                          onClick={() =>
                            setCookingRecipe({
                              id: recipe.id,
                              name: recipe.name,
                              portions: recipe.typical_portions ?? 1,
                            })
                          }
                          style={secondaryButtonStyle}
                          title="Record the batch and take its raw ingredients out of the kitchen."
                        >
                          Cooked it
                        </button>
                        {/* Recipe-backed with known macros: cook it and log a portion in one tap. */}
                        <button
                          type="button"
                          disabled={busyId === p.id}
                          onClick={() =>
                            eatRecipe(recipe.id, { mealType: p.meal_type, mealPlanId: p.id })
                          }
                          style={eatButtonStyle(busyId === p.id)}
                          title={
                            // "for the batch" was true while recipes.calories held the sum of the
                            // ingredient list. Since 2026-08-13 the resolver divides by
                            // typical_portions on write, so this figure is ONE SERVING and calling
                            // it the batch would misstate it by the batch size on every tooltip.
                            recipe.calories != null
                              ? `Logs one serving (~${recipe.calories} kcal) and adds any surplus to the fridge.`
                              : "Cooks this recipe and logs a portion's macros."
                          }
                        >
                          {busyId === p.id ? "Logging…" : "Ate this"}
                        </button>
                      </>
                    ) : (
                      // No cook and no resolved recipe — nothing to log macros from, but the
                      // outcome is still worth recording. Confirming intent beats a silent row.
                      <button
                        type="button"
                        disabled={busyId === p.id}
                        onClick={() => mark(p.id, "eaten")}
                        style={eatButtonStyle(busyId === p.id)}
                        title={
                          recipe
                            ? "Marks it eaten. This recipe has no macros yet, so none are logged."
                            : "Marks it eaten. No macros are logged."
                        }
                      >
                        {busyId === p.id ? "Saving…" : "Ate it"}
                      </button>
                    )}
                    <button
                      type="button"
                      disabled={busyId === p.id}
                      onClick={() => mark(p.id, "skipped")}
                      style={skipButtonStyle(busyId === p.id)}
                      title="Didn't eat this. A skip is data — it's how the plan finds out it was wrong."
                    >
                      Skip
                    </button>
                  </div>
                </div>
                {expanded && <PlannedMealDetail meal={p} />}
              </div>
            );
          })}
        </div>
      )}

      {leftovers.length > 0 && (
        <div>
          <p style={labelStyle}>In the fridge</p>
          {leftovers.map((c) => {
            const age = ageLabel(c.cooked_on);
            const cal = perPortion(c.calories, c.portions);
            const protein = perPortion(c.protein_g, c.portions);
            return (
              <div key={c.id} style={rowStyle}>
                <div>
                  <span style={nameStyle}>{c.name}</span>
                  <span
                    style={{ ...subStyle, color: age.stale ? "var(--color-danger)" : undefined }}
                  >
                    {c.portions_remaining} of {c.portions} left · {age.text}
                    {cal != null ? ` · ${cal} kcal` : ""}
                    {protein != null ? ` · ${protein}g protein` : ""}
                  </span>
                </div>
                <button
                  type="button"
                  disabled={busyId === c.id}
                  onClick={() => eat(c.id, {})}
                  style={eatButtonStyle(busyId === c.id)}
                >
                  {busyId === c.id ? "Logging…" : "Ate this"}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

const labelStyle: React.CSSProperties = {
  fontSize: "var(--t-micro)",
  fontWeight: 500,
  color: "var(--color-text-muted)",
  textTransform: "uppercase",
  letterSpacing: "0.04em",
  marginBottom: "var(--space-2)",
};

const rowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "var(--space-4)",
  padding: "var(--space-3) 0",
  borderBottom: "1px solid var(--rule-soft)",
};

// The name doubles as the expand toggle — a transparent, full-height button so the whole
// label is a tap target, with a caret to signal there's more underneath.
const expanderStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "baseline",
  gap: "var(--space-2)",
  minWidth: 0,
  flex: 1,
  background: "none",
  border: "none",
  padding: 0,
  textAlign: "left",
  cursor: "pointer",
};

const caretStyle: React.CSSProperties = {
  fontSize: "var(--t-micro)",
  color: "var(--color-text-faint)",
  flexShrink: 0,
};

const nameStyle: React.CSSProperties = {
  display: "block",
  fontSize: "var(--t-body)",
  color: "var(--color-text)",
};

const subStyle: React.CSSProperties = {
  display: "block",
  fontSize: "var(--t-micro)",
  color: "var(--color-text-muted)",
  marginTop: 2,
};

// "Cooked it" sits beside "Ate this" but is not the primary action on a planned meal — most
// taps here are still "I ate the thing". Outlined rather than filled so the two are told apart
// at a glance, since one of them spends inventory and the other does not.
const secondaryButtonStyle: React.CSSProperties = {
  fontFamily: "var(--font-body), system-ui, sans-serif",
  fontSize: "var(--t-micro)",
  fontWeight: 500,
  color: "var(--color-text)",
  background: "transparent",
  border: "1px solid var(--color-border)",
  borderRadius: "var(--r-1)",
  padding: "0 var(--space-3)",
  minHeight: 36,
  flexShrink: 0,
  cursor: "pointer",
};

// Skipping is a legitimate outcome, not a failure — it gets a quiet button, not a red one.
function skipButtonStyle(pending: boolean): React.CSSProperties {
  return {
    fontFamily: "var(--font-body), system-ui, sans-serif",
    fontSize: "var(--t-micro)",
    fontWeight: 500,
    color: "var(--color-text-muted)",
    background: "transparent",
    border: "1px solid var(--rule-soft)",
    borderRadius: "var(--r-1)",
    padding: "0 var(--space-3)",
    minHeight: 36,
    flexShrink: 0,
    cursor: pending ? "wait" : "pointer",
    opacity: pending ? 0.5 : 1,
    transition: "opacity var(--motion-fast) var(--ease-out-quart)",
  };
}

function eatButtonStyle(pending: boolean): React.CSSProperties {
  return {
    fontFamily: "var(--font-body), system-ui, sans-serif",
    fontSize: "var(--t-micro)",
    fontWeight: 500,
    color: "var(--color-text-on-cta)",
    background: "var(--accent)",
    border: "none",
    borderRadius: "var(--r-1)",
    padding: "0 var(--space-4)",
    minHeight: 36,
    flexShrink: 0,
    cursor: pending ? "wait" : "pointer",
    opacity: pending ? 0.5 : 1,
    transition: "opacity var(--motion-fast) var(--ease-out-quart)",
  };
}
