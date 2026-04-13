export const dynamic = "force-dynamic";

import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { MessageSquare } from "lucide-react";
import { daysAgoString } from "@/lib/timezone";
import FoodPhotoAnalyzer from "./FoodPhotoAnalyzer";
import MacroSummaryCard from "@/components/meals/MacroSummaryCard";

interface MealRow {
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

function fmtDate(d: string) {
  return new Date(d + "T00:00:00").toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

const MEAL_ORDER: Record<string, number> = {
  breakfast: 0, lunch: 1, dinner: 2, snack: 3,
};

export default async function MealsPage() {
  const supabase = await createClient();

  const { data } = await supabase
    .from("meal_log")
    .select("id, date, meal_type, notes, calories, protein_g, carbs_g, fat_g, recipes(name)")
    .gte("date", daysAgoString(6))
    .order("date", { ascending: false })
    .order("meal_type", { ascending: true });

  const meals = (data ?? []) as unknown as MealRow[];

  // Group by date
  const byDate = new Map<string, MealRow[]>();
  for (const meal of meals) {
    if (!byDate.has(meal.date)) byDate.set(meal.date, []);
    byDate.get(meal.date)!.push(meal);
  }
  const dates = Array.from(byDate.keys());

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading font-semibold" style={{ fontSize: 24, color: "var(--color-text)" }}>
          Meals
        </h1>
        <p className="mt-1" style={{ fontSize: 14, color: "var(--color-text-muted)" }}>
          Last 7 days
        </p>
      </div>

      {/* Macro summary */}
      <MacroSummaryCard />

      {/* Photo analyzer */}
      <FoodPhotoAnalyzer />

      {/* Log via chat nudge */}
      <div
        className="flex items-center gap-3 rounded-xl px-4 py-3"
        style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)" }}
      >
        <MessageSquare size={16} style={{ color: "var(--color-primary)", flexShrink: 0 }} />
        <p style={{ fontSize: 14, color: "var(--color-text-muted)" }}>
          Or log meals by telling{" "}
          <Link
            href="/chat"
            style={{ color: "var(--color-primary)", textDecoration: "underline", textUnderlineOffset: 2 }}
          >
            Mr. Bridge
          </Link>{" "}
          what you ate.
        </p>
      </div>

      {/* Meal log */}
      {dates.length === 0 ? (
        <div
          className="rounded-xl p-8 text-center"
          style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)" }}
        >
          <p style={{ fontSize: 14, color: "var(--color-text-faint)" }}>No meals logged this week</p>
        </div>
      ) : (
        <div className="space-y-4">
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
                    <div key={m.id} className="flex items-baseline gap-3">
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
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
