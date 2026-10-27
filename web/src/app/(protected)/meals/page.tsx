export const dynamic = "force-dynamic";

import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { daysAgoString, daysAheadString, getNextNDays, todayString } from "@/lib/timezone";
import {
  KitchenPanel,
  type KitchenCook,
  type KitchenPlannedMeal,
} from "@/components/meals/KitchenPanel";
import { WeekPlan } from "@/components/meals/WeekPlan";
import MealsClient, {
  type MealRow,
  type RecipeRow,
  type MacroGoals,
  type MacroTotals,
  type DailyMacroTotals,
} from "@/components/meals/MealsClient";
import { macroGoalsFromProfile, sumMacroTotals } from "@/lib/nutrition/daily-macros";
import { MEAL_PLAN_SELECT } from "@/lib/nutrition/next-meal";

export const metadata: Metadata = {
  title: "Meals",
  description: "Meal log, macro totals, and recipes.",
};

export default async function MealsPage() {
  const supabase = await createClient();

  // Wave 1 — meal_log and profile don't need user.id; run with getUser in parallel.
  const [
    {
      data: { user },
    },
    { data: mealsData },
    { data: profileData },
    { data: trendsData },
  ] = await Promise.all([
    supabase.auth.getUser(),
    supabase
      .from("meal_log")
      .select(
        "id, date, meal_type, notes, calories, protein_g, carbs_g, fat_g, fiber_g, sugar_g, recipes(name), cooks(name)",
      )
      .gte("date", daysAgoString(6))
      .order("date", { ascending: false })
      .order("meal_type", { ascending: true }),
    supabase.from("profile").select("key, value"),
    supabase
      .from("meal_log")
      .select("date, calories, protein_g, carbs_g, fat_g, fiber_g, sugar_g")
      .gte("date", daysAgoString(29))
      .order("date", { ascending: true }),
  ]);

  // Wave 2 — these all need user.id from Wave 1.
  const userId = user?.id;
  const [{ data: recipesData }, { data: leftoversData }, { data: planData }] = await Promise.all([
    userId
      ? supabase
          .from("recipes")
          .select(
            "id, name, cuisine, tags, ingredients, instructions, ingredients_json, steps_json, typical_portions",
          )
          .eq("user_id", userId)
          .order("name")
      : Promise.resolve({ data: [] }),
    // The kitchen is fetched here rather than by the client component so the panel has no
    // loading flash and no fetch waterfall. router.refresh() re-runs this after "Ate this".
    userId
      ? supabase
          .from("cooks")
          .select("id, name, cooked_on, portions, portions_remaining, calories, protein_g")
          .eq("user_id", userId)
          .gt("portions_remaining", 0)
          .order("cooked_on", { ascending: true }) // oldest first — eat it before it turns
      : Promise.resolve({ data: [] }),
    // The next 7 days, not just today. KitchenPanel still renders today's slice for one-tap
    // logging; the rest feeds the week view. One query serves both — a plan you can't see
    // until the day arrives isn't a plan.
    userId
      ? supabase
          .from("meal_plans")
          .select(MEAL_PLAN_SELECT)
          .eq("user_id", userId)
          .gte("date", todayString())
          .lte("date", daysAheadString(6))
          .order("date", { ascending: true })
      : Promise.resolve({ data: [] }),
  ]);

  const meals = (mealsData ?? []) as unknown as MealRow[];
  const recipes = (recipesData ?? []) as unknown as RecipeRow[];
  const weekPlan = (planData ?? []) as unknown as KitchenPlannedMeal[];

  // Profile → macro goals
  const profileMap: Record<string, string> = {};
  for (const row of profileData ?? []) {
    profileMap[row.key] = row.value;
  }
  const macroGoals: MacroGoals = macroGoalsFromProfile(profileMap);

  // Split meals into today vs past
  const today = todayString();
  const todayMeals = meals.filter((m) => m.date === today);
  const pastMeals = meals.filter((m) => m.date !== today);

  // Today's macro totals — same derivation the dashboard uses (lib/nutrition/daily-macros.ts).
  // fiber/sugar stay null when no meal today reports them — they render as em-dash, not 0.
  const macroTotals: MacroTotals = sumMacroTotals(todayMeals);

  // Aggregate meal_log rows into daily macro totals for the Trends tab.
  // Fiber/sugar stay null when no meal that day reported them — "not tracked" != 0.
  const trendAccum = new Map<
    string,
    {
      calories: number;
      protein: number;
      carbs: number;
      fat: number;
      fiberSum: number;
      fiberAny: boolean;
      sugarSum: number;
      sugarAny: boolean;
    }
  >();
  for (const row of trendsData ?? []) {
    const key = row.date as string;
    if (!trendAccum.has(key)) {
      trendAccum.set(key, {
        calories: 0,
        protein: 0,
        carbs: 0,
        fat: 0,
        fiberSum: 0,
        fiberAny: false,
        sugarSum: 0,
        sugarAny: false,
      });
    }
    const e = trendAccum.get(key)!;
    e.calories += (row.calories as number | null) ?? 0;
    e.protein += (row.protein_g as number | null) ?? 0;
    e.carbs += (row.carbs_g as number | null) ?? 0;
    e.fat += (row.fat_g as number | null) ?? 0;
    if (row.fiber_g != null) {
      e.fiberSum += row.fiber_g as number;
      e.fiberAny = true;
    }
    if (row.sugar_g != null) {
      e.sugarSum += row.sugar_g as number;
      e.sugarAny = true;
    }
  }
  const macroTrends: DailyMacroTotals[] = Array.from(trendAccum.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, e]) => ({
      date,
      calories: e.calories,
      protein: Math.round(e.protein),
      carbs: Math.round(e.carbs),
      fat: Math.round(e.fat),
      fiber: e.fiberAny ? Math.round(e.fiberSum * 10) / 10 : null,
      sugar: e.sugarAny ? Math.round(e.sugarSum * 10) / 10 : null,
    }));

  return (
    <div className="max-w-2xl">
      <div style={{ marginBottom: "var(--space-5)" }}>
        <h1
          className="font-heading font-semibold"
          style={{ fontSize: "var(--t-h1)", color: "var(--color-text)" }}
        >
          Meals
        </h1>
        <p
          className="mt-1"
          style={{ fontSize: "var(--t-micro)", color: "var(--color-text-muted)" }}
        >
          Meal Hub
        </p>
      </div>

      <MealsClient
        todayLead={
          <>
            <KitchenPanel
              leftovers={(leftoversData ?? []) as unknown as KitchenCook[]}
              plan={weekPlan.filter((p) => p.date === today)}
            />
            <WeekPlan week={weekPlan} days={getNextNDays(7)} today={today} />
          </>
        }
        todayMeals={todayMeals}
        pastMeals={pastMeals}
        recipes={recipes}
        macroGoals={macroGoals}
        macroTotals={macroTotals}
        macroTrends={macroTrends}
      />
    </div>
  );
}
