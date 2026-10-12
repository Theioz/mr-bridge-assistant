"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { MacroBars } from "@/components/meals/MacroBars";
import type { KitchenPlannedMeal } from "@/components/meals/KitchenPanel";
import type { MacroGoals, MacroTotals } from "@/lib/nutrition/daily-macros";
import { postEat } from "@/lib/nutrition/eat-client";
import { eatTargetFor } from "@/lib/nutrition/next-meal";

interface Props {
  /** The next still-planned, not-yet-logged meal today (pickNextPlannedMeal), or null. */
  nextMeal: KitchenPlannedMeal | null;
  goals: MacroGoals;
  totals: MacroTotals;
  /** A "Stay at …" event covers today — plans are paused rather than missing. */
  traveling: boolean;
}

function capitalize(s: string): string {
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}

/** One portion's calories, as "Ate this" would log them. Null when unknown. */
function portionKcal(meal: KitchenPlannedMeal): number | null {
  if (meal.cooks) {
    const { calories, portions } = meal.cooks;
    return calories != null && portions > 0 ? Math.round(calories / portions) : null;
  }
  // recipes.calories is ONE serving since 2026-08-13 (see KitchenPanel's tooltip note).
  return meal.recipes?.calories ?? null;
}

const textStyle: React.CSSProperties = {
  margin: 0,
  fontSize: "var(--t-body)",
  color: "var(--color-text-muted)",
  lineHeight: 1.5,
};

/**
 * Today's food — the most-used feature, first on the dashboard (#761).
 *
 * "Ate this" goes through postEat → POST /api/meals/eat, the same request the Meals page's
 * KitchenPanel makes, so it writes meal_log, draws down the cook and marks the plan satisfied in
 * one server-side step. A plan with no macros to log (freeform, or an unresolved recipe stub) gets
 * NO button here: marking it eaten would be a status with no meal_log row behind it, which is the
 * exact bug class #730 closed. Those link to the Meals page instead.
 */
export default function TodayFood({ nextMeal, goals, totals, traveling }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const target = nextMeal ? eatTargetFor(nextMeal) : null;
  const hasAnyGoal = goals.calories != null || goals.protein != null;

  async function ate() {
    if (!nextMeal || !target) return;
    setBusy(true);
    setError(null);
    const result = await postEat(target, { mealType: nextMeal.meal_type, mealPlanId: nextMeal.id });
    if (result.ok) {
      // Re-run the dashboard query: the macro bars move and the next meal advances.
      router.refresh();
    } else {
      setError(result.error);
    }
    setBusy(false);
  }

  const label = nextMeal
    ? (nextMeal.cooks?.name ?? nextMeal.recipes?.name ?? nextMeal.name ?? "Meal")
    : null;
  const kcal = nextMeal ? portionKcal(nextMeal) : null;

  return (
    <section id="todays-food" style={{ scrollMarginTop: "var(--space-5)" }}>
      <h2 className="db-section-label">
        Today&apos;s food
        <span className="meta tnum">· {totals.calories} kcal logged</span>
      </h2>

      <div className="grid grid-cols-1 lg:grid-cols-2" style={{ gap: "var(--space-6)" }}>
        <div>
          {nextMeal ? (
            <div>
              <p
                style={{
                  margin: 0,
                  fontSize: "var(--t-micro)",
                  color: "var(--color-text-faint)",
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                }}
              >
                Next · {capitalize(nextMeal.meal_type)}
              </p>
              <p
                style={{
                  margin: "var(--space-1) 0 0",
                  fontSize: "var(--t-h2)",
                  fontWeight: 500,
                  color: "var(--color-text)",
                  overflowWrap: "anywhere",
                }}
              >
                {label}
              </p>
              {kcal != null && (
                <p className="tnum" style={{ ...textStyle, fontSize: "var(--t-micro)" }}>
                  ~{kcal} kcal per portion
                </p>
              )}
              <div
                className="flex flex-wrap items-center"
                style={{ gap: "var(--space-3)", marginTop: "var(--space-4)" }}
              >
                {target ? (
                  <button
                    type="button"
                    onClick={ate}
                    disabled={busy}
                    className="dash-action dash-action-primary"
                  >
                    {busy ? "Logging…" : "Ate this"}
                  </button>
                ) : (
                  <Link href="/meals" className="dash-action">
                    Log it in Meals
                  </Link>
                )}
                <Link href="/meals" className="dash-action">
                  Something else
                </Link>
              </div>
              {!target && (
                <p
                  style={{ ...textStyle, fontSize: "var(--t-micro)", marginTop: "var(--space-2)" }}
                >
                  No macros on this plan yet, so it can&apos;t be logged in one tap.
                </p>
              )}
              {error && (
                <p
                  role="status"
                  style={{
                    ...textStyle,
                    fontSize: "var(--t-micro)",
                    color: "var(--color-danger)",
                    marginTop: "var(--space-2)",
                  }}
                >
                  {error}
                </p>
              )}
            </div>
          ) : traveling ? (
            <div>
              <p style={textStyle}>Meal plans are paused while you&apos;re traveling.</p>
              <div
                className="flex flex-wrap"
                style={{ gap: "var(--space-3)", marginTop: "var(--space-4)" }}
              >
                <Link href="/meals" className="dash-action">
                  Log a meal
                </Link>
              </div>
            </div>
          ) : (
            <div>
              <p style={textStyle}>Nothing else planned for today.</p>
              <div
                className="flex flex-wrap"
                style={{ gap: "var(--space-3)", marginTop: "var(--space-4)" }}
              >
                <Link href="/meals" className="dash-action">
                  Log a meal
                </Link>
                <Link href="/meals#week-plan" className="dash-action">
                  Plan ahead
                </Link>
              </div>
            </div>
          )}
        </div>

        <div>
          {hasAnyGoal ? (
            <MacroBars
              totals={totals}
              goals={goals}
              include={["calories", "protein", "carbs", "fat"]}
            />
          ) : (
            <p style={textStyle}>
              No macro targets set.{" "}
              <Link href="/settings" style={{ color: "var(--accent-text)", fontWeight: 500 }}>
                Set targets
              </Link>
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
