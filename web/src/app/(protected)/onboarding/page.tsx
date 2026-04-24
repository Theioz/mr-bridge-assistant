export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { generateText } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { createClient } from "@/lib/supabase/server";
import { OnboardingWizard } from "@/components/onboarding/onboarding-wizard";
import type { SportsFavorite } from "@/lib/sync/sports";

type NutritionTargets = {
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
};

async function upsert(userId: string, key: string, value: string) {
  const supabase = await createClient();
  await supabase
    .from("profile")
    .upsert({ user_id: userId, key, value }, { onConflict: "user_id,key" });
}

async function getUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

async function saveNameAndLocation(name: string, city: string) {
  "use server";
  const user = await getUser();
  if (!user) return;
  const supabase = await createClient();
  const rows = [
    { user_id: user.id, key: "name", value: name },
    { user_id: user.id, key: "location_city", value: city },
  ].filter((r) => r.value.trim());
  for (const row of rows) {
    await supabase.from("profile").upsert(row, { onConflict: "user_id,key" });
  }
  revalidatePath("/dashboard");
}

async function saveBodyStats(birthday: string, weightLb: string, heightCm: string, sex: string) {
  "use server";
  const user = await getUser();
  if (!user) return;
  const rows = [
    { key: "birthday", value: birthday },
    { key: "body_weight_lb", value: weightLb },
    { key: "height_cm", value: heightCm },
    { key: "biological_sex", value: sex },
  ].filter((r) => r.value.trim());
  for (const row of rows) await upsert(user.id, row.key, row.value);
}

async function saveFocus(focus: string[]) {
  "use server";
  const user = await getUser();
  if (!user) return;
  await upsert(user.id, "primary_focus", JSON.stringify(focus));
}

async function saveFitnessGoals(goal: string, level: string) {
  "use server";
  const user = await getUser();
  if (!user) return;
  if (goal.trim()) await upsert(user.id, "fitness_goal", goal);
  if (level.trim()) await upsert(user.id, "fitness_level", level);
}

async function saveWorkoutPreferences(prefs: string[], equip: string[]) {
  "use server";
  const user = await getUser();
  if (!user) return;
  await upsert(user.id, "workout_preferences", JSON.stringify(prefs));
  await upsert(user.id, "equipment_preference", JSON.stringify(equip));
}

async function saveNutritionTargets(
  calories: string,
  proteinG: string,
  carbsG: string,
  fatG: string,
) {
  "use server";
  const user = await getUser();
  if (!user) return;
  const rows = [
    { key: "calorie_target", value: calories },
    { key: "protein_target_g", value: proteinG },
    { key: "carb_target_g", value: carbsG },
    { key: "fat_target_g", value: fatG },
  ].filter((r) => r.value.trim());
  for (const row of rows) await upsert(user.id, row.key, row.value);
}

async function suggestNutritionTargets(): Promise<NutritionTargets | null> {
  "use server";
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: rows } = await supabase.from("profile").select("key,value").eq("user_id", user.id);
  const v: Record<string, string> = {};
  for (const r of rows ?? []) v[r.key] = r.value;

  // Prefer live fitness_log weight over onboarding baseline
  const { data: latestWeightRow } = await supabase
    .from("fitness_log")
    .select("weight_lb")
    .eq("user_id", user.id)
    .not("weight_lb", "is", null)
    .order("date", { ascending: false })
    .limit(1)
    .maybeSingle();

  const weightLb =
    latestWeightRow?.weight_lb ?? (v["body_weight_lb"] ? parseFloat(v["body_weight_lb"]) : null);
  const heightCm = v["height_cm"] ? parseFloat(v["height_cm"]) : null;
  const birthday = v["birthday"];
  const age = birthday
    ? Math.floor((Date.now() - new Date(birthday).getTime()) / (365.25 * 24 * 60 * 60 * 1000))
    : null;
  const sex = v["biological_sex"] ?? null;
  const goal = v["fitness_goal"] ?? null;
  const level = v["fitness_level"] ?? null;
  const workoutPrefs = v["workout_preferences"]
    ? (JSON.parse(v["workout_preferences"]) as string[])
    : [];

  const parts: string[] = [];
  if (age) parts.push(`Age: ${age}`);
  if (sex) parts.push(`Sex: ${sex}`);
  if (weightLb) parts.push(`Weight: ${weightLb} lbs (${(weightLb / 2.20462).toFixed(1)} kg)`);
  if (heightCm) parts.push(`Height: ${heightCm} cm`);
  if (goal) parts.push(`Goal: ${goal.replace(/_/g, " ")}`);
  if (level) parts.push(`Fitness level: ${level}`);
  if (workoutPrefs.length > 0) parts.push(`Workout types: ${workoutPrefs.join(", ")}`);

  if (parts.length === 0) return null;

  try {
    const { text } = await generateText({
      model: anthropic("claude-haiku-4-5-20251001"),
      maxOutputTokens: 80,
      prompt: `You are a sports nutritionist. Return ONLY a JSON object — no markdown, no explanation — with daily macro targets for this person:\n\n${parts.join("\n")}\n\nFormat: {"calories":2400,"protein_g":180,"carbs_g":260,"fat_g":70}`,
    });
    const parsed = JSON.parse(text.trim()) as NutritionTargets;
    if (
      typeof parsed.calories === "number" &&
      typeof parsed.protein_g === "number" &&
      typeof parsed.carbs_g === "number" &&
      typeof parsed.fat_g === "number"
    ) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

async function saveWatchlist(tickers: string[]) {
  "use server";
  const user = await getUser();
  if (!user) return;
  await upsert(user.id, "stock_watchlist", JSON.stringify(tickers));
}

async function saveSportsFavorites(favorites: SportsFavorite[]) {
  "use server";
  const user = await getUser();
  if (!user) return;
  await upsert(user.id, "sports_favorites", JSON.stringify(favorites));
}

async function completeOnboarding() {
  "use server";
  const user = await getUser();
  if (!user) return;
  await upsert(user.id, "onboarding_completed", "true");
  redirect("/dashboard");
}

export default async function OnboardingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: rows } = await supabase.from("profile").select("key,value").eq("user_id", user.id);
  const v: Record<string, string> = {};
  for (const row of rows ?? []) v[row.key] = row.value;

  if (v["onboarding_completed"] === "true") redirect("/dashboard");

  return (
    <div className="max-w-2xl">
      <OnboardingWizard
        initialName={v["name"] ?? ""}
        initialLocation={v["location_city"] ?? ""}
        initialBirthday={v["birthday"] ?? ""}
        initialWeightLb={v["body_weight_lb"] ?? ""}
        initialHeightCm={v["height_cm"] ?? ""}
        initialBiologicalSex={v["biological_sex"] ?? ""}
        initialFocus={JSON.parse(v["primary_focus"] ?? "[]") as string[]}
        initialFitnessGoal={v["fitness_goal"] ?? ""}
        initialFitnessLevel={v["fitness_level"] ?? ""}
        initialWorkoutPrefs={JSON.parse(v["workout_preferences"] ?? "[]") as string[]}
        initialEquipment={JSON.parse(v["equipment_preference"] ?? "[]") as string[]}
        initialCalorieTarget={v["calorie_target"] ?? ""}
        initialProteinTarget={v["protein_target_g"] ?? ""}
        initialCarbTarget={v["carb_target_g"] ?? ""}
        initialFatTarget={v["fat_target_g"] ?? ""}
        initialWatchlist={JSON.parse(v["stock_watchlist"] ?? "[]") as string[]}
        initialSportsFavorites={JSON.parse(v["sports_favorites"] ?? "[]") as SportsFavorite[]}
        saveNameAndLocationAction={saveNameAndLocation}
        saveBodyStatsAction={saveBodyStats}
        saveFocusAction={saveFocus}
        saveFitnessGoalsAction={saveFitnessGoals}
        saveWorkoutPreferencesAction={saveWorkoutPreferences}
        saveNutritionTargetsAction={saveNutritionTargets}
        suggestNutritionTargetsAction={suggestNutritionTargets}
        saveWatchlistAction={saveWatchlist}
        saveSportsFavoritesAction={saveSportsFavorites}
        completeAction={completeOnboarding}
      />
    </div>
  );
}
