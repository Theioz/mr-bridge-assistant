export const dynamic = "force-dynamic";

import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { daysAgoString, todayString } from "@/lib/timezone";
import MealsClient, { type MealRow, type RecipeRow, type MacroGoals, type MacroTotals } from "@/components/meals/MealsClient";

export const metadata: Metadata = {
  title: "Meals",
  description: "Meal log, macro totals, and recipes.",
};

export default async function MealsPage() {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  const userId = user?.id;

  const [{ data: mealsData }, { data: recipesData }, { data: profileData }] = await Promise.all([
    supabase
      .from("meal_log")
      .select("id, date, meal_type, notes, calories, protein_g, carbs_g, fat_g, fiber_g, sugar_g, recipes(name)")
      .gte("date", daysAgoString(6))
      .order("date", { ascending: false })
      .order("meal_type", { ascending: true }),
    userId
      ? supabase
          .from("recipes")
          .select("id, name, cuisine, tags, ingredients")
          .eq("user_id", userId)
          .order("name")
      : Promise.resolve({ data: [] }),
    supabase.from("profile").select("key, value"),
  ]);

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

  return (
    <div className="max-w-2xl">
      <div style={{ marginBottom: "var(--space-5)" }}>
        <h1 className="font-heading font-semibold" style={{ fontSize: "var(--t-h1)", color: "var(--color-text)" }}>
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
      />
    </div>
  );
}
