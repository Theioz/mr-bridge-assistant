export const dynamic = "force-dynamic";

import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { daysAgoString, todayString } from "@/lib/timezone";
import MealsClient, {
  type MealRow,
  type RecipeRow,
  type MacroGoals,
  type MacroTotals,
  type DailyMacroTotals,
} from "@/components/meals/MealsClient";

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
        "id, date, meal_type, notes, calories, protein_g, carbs_g, fat_g, fiber_g, sugar_g, recipes(name)",
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

  // Wave 2 — recipes query needs user.id from Wave 1.
  const userId = user?.id;
  const { data: recipesData } = await (userId
    ? supabase
        .from("recipes")
        .select("id, name, cuisine, tags, ingredients")
        .eq("user_id", userId)
        .order("name")
    : Promise.resolve({ data: [] }));

  const meals = (mealsData ?? []) as unknown as MealRow[];
  const recipes = (recipesData ?? []) as unknown as RecipeRow[];

  // Profile → macro goals
  const profileMap: Record<string, string> = {};
  for (const row of profileData ?? []) {
    profileMap[row.key] = row.value;
  }
  const macroGoals: MacroGoals = {
    calories: profileMap["calorie_goal"] ? parseInt(profileMap["calorie_goal"], 10) : null,
    protein: profileMap["protein_goal"] ? parseInt(profileMap["protein_goal"], 10) : null,
    carbs: profileMap["carbs_goal"] ? parseInt(profileMap["carbs_goal"], 10) : null,
    fat: profileMap["fat_goal"] ? parseInt(profileMap["fat_goal"], 10) : null,
    // Fiber defaults to 30g when unset — common public-health target.
    fiber: profileMap["fiber_goal"] ? parseInt(profileMap["fiber_goal"], 10) : 30,
  };

  // Split meals into today vs past
  const today = todayString();
  const todayMeals = meals.filter((m) => m.date === today);
  const pastMeals = meals.filter((m) => m.date !== today);

  // Compute today's macro totals (entries with at least some macro data).
  // fiber/sugar stay null when no meal today reports them — they render as em-dash, not 0.
  const macroSums = todayMeals.reduce<MacroTotals>(
    (acc, m) => ({
      calories: acc.calories + (m.calories ?? 0),
      protein: acc.protein + (m.protein_g ?? 0),
      carbs: acc.carbs + (m.carbs_g ?? 0),
      fat: acc.fat + (m.fat_g ?? 0),
      fiber: m.fiber_g != null ? (acc.fiber ?? 0) + m.fiber_g : acc.fiber,
      sugar: m.sugar_g != null ? (acc.sugar ?? 0) + m.sugar_g : acc.sugar,
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: null, sugar: null },
  );
  const macroTotals: MacroTotals = {
    calories: macroSums.calories,
    protein: Math.round(macroSums.protein),
    carbs: Math.round(macroSums.carbs),
    fat: Math.round(macroSums.fat),
    fiber: macroSums.fiber != null ? Math.round(macroSums.fiber * 10) / 10 : null,
    sugar: macroSums.sugar != null ? Math.round(macroSums.sugar * 10) / 10 : null,
  };

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
