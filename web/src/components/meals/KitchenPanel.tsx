"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

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
  recipes: { id: string; name: string } | null;
  cooks: { id: string; name: string; portions: number; portions_remaining: number } | null;
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
  const [error, setError] = useState<string | null>(null);

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

  // Outcome without macros. `eat()` above needs a cook, because it logs known numbers into
  // meal_log. Most planned meals have no cook — a recipe not yet made, or freeform text — and
  // those could previously be neither confirmed nor declined. Things don't go to plan; the plan
  // has to be able to hear about it.
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
            return (
              <div key={p.id} style={rowStyle}>
                <div>
                  <span style={nameStyle}>{label}</span>
                  <span style={subStyle}>
                    {p.meal_type}
                    {!cook && p.recipes ? " · needs cooking" : ""}
                    {!cook && !p.recipes ? " · off-plan" : ""}
                  </span>
                </div>
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
                  ) : (
                    // No cook — nothing to decrement and no macros to log, but the outcome is
                    // still worth recording. Confirming intent beats leaving the row silent.
                    <button
                      type="button"
                      disabled={busyId === p.id}
                      onClick={() => mark(p.id, "eaten")}
                      style={eatButtonStyle(busyId === p.id)}
                      title={
                        p.recipes
                          ? "Marks it eaten. Not cooked, so no macros are logged."
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
