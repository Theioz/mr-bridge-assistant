export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { OnboardingWizard } from "@/components/onboarding/onboarding-wizard";
import type { SportsFavorite } from "@/lib/sync/sports";

async function saveNameAndLocation(name: string, city: string) {
  "use server";
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;
  const rows = [
    { user_id: user.id, key: "name", value: name },
    { user_id: user.id, key: "location_city", value: city },
  ].filter((r) => r.value.trim());
  for (const row of rows) {
    await supabase.from("profile").upsert(row, { onConflict: "user_id,key" });
  }
  revalidatePath("/dashboard");
}

async function saveFocus(focus: string[]) {
  "use server";
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;
  await supabase
    .from("profile")
    .upsert(
      { user_id: user.id, key: "primary_focus", value: JSON.stringify(focus) },
      { onConflict: "user_id,key" },
    );
}

async function saveFitnessGoals(goal: string, level: string) {
  "use server";
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;
  const rows = [
    { user_id: user.id, key: "fitness_goal", value: goal },
    { user_id: user.id, key: "fitness_level", value: level },
  ].filter((r) => r.value.trim());
  for (const row of rows) {
    await supabase.from("profile").upsert(row, { onConflict: "user_id,key" });
  }
}

async function saveWorkoutPreferences(prefs: string[], equip: string[]) {
  "use server";
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;
  const rows = [
    { user_id: user.id, key: "workout_preferences", value: JSON.stringify(prefs) },
    { user_id: user.id, key: "equipment_preference", value: JSON.stringify(equip) },
  ];
  for (const row of rows) {
    await supabase.from("profile").upsert(row, { onConflict: "user_id,key" });
  }
}

async function saveNutritionTargets(calories: string, proteinG: string) {
  "use server";
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;
  const rows = [
    { user_id: user.id, key: "calorie_target", value: calories },
    { user_id: user.id, key: "protein_target_g", value: proteinG },
  ].filter((r) => r.value.trim());
  for (const row of rows) {
    await supabase.from("profile").upsert(row, { onConflict: "user_id,key" });
  }
}

async function saveWatchlist(tickers: string[]) {
  "use server";
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;
  await supabase
    .from("profile")
    .upsert(
      { user_id: user.id, key: "stock_watchlist", value: JSON.stringify(tickers) },
      { onConflict: "user_id,key" },
    );
}

async function saveSportsFavorites(favorites: SportsFavorite[]) {
  "use server";
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;
  await supabase
    .from("profile")
    .upsert(
      { user_id: user.id, key: "sports_favorites", value: JSON.stringify(favorites) },
      { onConflict: "user_id,key" },
    );
}

async function completeOnboarding() {
  "use server";
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;
  await supabase
    .from("profile")
    .upsert(
      { user_id: user.id, key: "onboarding_completed", value: "true" },
      { onConflict: "user_id,key" },
    );
  redirect("/dashboard");
}

export default async function OnboardingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: rows } = await supabase.from("profile").select("key,value").eq("user_id", user.id);

  const values: Record<string, string> = {};
  for (const row of rows ?? []) {
    values[row.key] = row.value;
  }

  if (values["onboarding_completed"] === "true") redirect("/dashboard");

  const initialWatchlist = JSON.parse(values["stock_watchlist"] ?? "[]") as string[];
  const initialSportsFavorites = JSON.parse(values["sports_favorites"] ?? "[]") as SportsFavorite[];

  return (
    <div className="max-w-2xl">
      <OnboardingWizard
        initialName={values["name"] ?? ""}
        initialLocation={values["location_city"] ?? ""}
        initialFocus={JSON.parse(values["primary_focus"] ?? "[]") as string[]}
        initialFitnessGoal={values["fitness_goal"] ?? ""}
        initialFitnessLevel={values["fitness_level"] ?? ""}
        initialWorkoutPrefs={JSON.parse(values["workout_preferences"] ?? "[]") as string[]}
        initialEquipment={JSON.parse(values["equipment_preference"] ?? "[]") as string[]}
        initialCalorieTarget={values["calorie_target"] ?? ""}
        initialProteinTarget={values["protein_target_g"] ?? ""}
        initialWatchlist={initialWatchlist}
        initialSportsFavorites={initialSportsFavorites}
        saveNameAndLocationAction={saveNameAndLocation}
        saveFocusAction={saveFocus}
        saveFitnessGoalsAction={saveFitnessGoals}
        saveWorkoutPreferencesAction={saveWorkoutPreferences}
        saveNutritionTargetsAction={saveNutritionTargets}
        saveWatchlistAction={saveWatchlist}
        saveSportsFavoritesAction={saveSportsFavorites}
        completeAction={completeOnboarding}
      />
    </div>
  );
}
