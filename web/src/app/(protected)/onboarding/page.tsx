export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { computeNutritionTargets } from "@/lib/nutrition/targets";
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

async function saveBodyStats(
  birthday: string,
  weightLb: string,
  heightCm: string,
  sex: string,
  targetWeightLb: string,
) {
  "use server";
  const user = await getUser();
  if (!user) return;
  const rows = [
    { key: "birthday", value: birthday },
    { key: "body_weight_lb", value: weightLb },
    { key: "height_cm", value: heightCm },
    { key: "biological_sex", value: sex },
    { key: "target_weight_lb", value: targetWeightLb },
  ].filter((r) => r.value.trim());
  for (const row of rows) await upsert(user.id, row.key, row.value);
}

async function saveFocus(focus: string[]) {
  "use server";
  const user = await getUser();
  if (!user) return;
  await upsert(user.id, "primary_focus", JSON.stringify(focus));
}

async function saveFitnessGoals(goal: string, level: string, workoutDaysPerWeek: string) {
  "use server";
  const user = await getUser();
  if (!user) return;
  if (goal.trim()) await upsert(user.id, "fitness_goal", goal);
  if (level.trim()) await upsert(user.id, "fitness_level", level);
  if (workoutDaysPerWeek.trim()) await upsert(user.id, "workout_days_per_week", workoutDaysPerWeek);
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

type NutritionOverrides = {
  birthday?: string;
  weightLb?: string;
  heightCm?: string;
  biologicalSex?: string;
  fitnessGoal?: string;
  fitnessLevel?: string;
  workoutPrefs?: string[];
  targetWeightLb?: string;
  workoutDaysPerWeek?: string;
};

async function suggestNutritionTargets(
  overrides?: NutritionOverrides,
): Promise<NutritionTargets | null> {
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

  // Overrides (unsaved wizard state) take priority over persisted profile values
  const rawWeightLb = overrides?.weightLb ?? v["body_weight_lb"];
  const weightLb = latestWeightRow?.weight_lb ?? (rawWeightLb ? parseFloat(rawWeightLb) : null);
  const rawHeightCm = overrides?.heightCm ?? v["height_cm"];
  const heightCm = rawHeightCm ? parseFloat(rawHeightCm) : null;
  const birthday = overrides?.birthday ?? v["birthday"];
  const age = birthday
    ? Math.floor((Date.now() - new Date(birthday).getTime()) / (365.25 * 24 * 60 * 60 * 1000))
    : null;
  const sex = overrides?.biologicalSex ?? v["biological_sex"] ?? null;
  const goal = overrides?.fitnessGoal ?? v["fitness_goal"] ?? null;
  const rawTargetWeightLb = overrides?.targetWeightLb ?? v["target_weight_lb"];
  const targetWeightLb = rawTargetWeightLb ? parseFloat(rawTargetWeightLb) : null;
  const workoutDaysPerWeek = overrides?.workoutDaysPerWeek ?? v["workout_days_per_week"] ?? null;

  // Computed with Mifflin-St Jeor rather than asked of an LLM (#476). The model
  // was being handed exactly the inputs to the equation and asked to approximate
  // its output — deterministic beats plausible here. Returns null when the inputs
  // are insufficient, so the wizard leaves the fields blank instead of inventing
  // numbers (the LLM path would happily hallucinate targets from a partial profile).
  return computeNutritionTargets({
    ageYears: age,
    biologicalSex: sex,
    weightLb,
    targetWeightLb,
    heightCm,
    goal,
    workoutDaysPerWeek: workoutDaysPerWeek ? Number(workoutDaysPerWeek) : null,
  });
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
        initialTargetWeightLb={v["target_weight_lb"] ?? ""}
        initialHeightCm={v["height_cm"] ?? ""}
        initialBiologicalSex={v["biological_sex"] ?? ""}
        initialFocus={JSON.parse(v["primary_focus"] ?? "[]") as string[]}
        initialFitnessGoal={v["fitness_goal"] ?? ""}
        initialFitnessLevel={v["fitness_level"] ?? ""}
        initialWorkoutDaysPerWeek={v["workout_days_per_week"] ?? ""}
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
