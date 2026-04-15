export const dynamic = "force-dynamic";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { ProfileForm } from "@/components/settings/profile-form";
import { WatchlistSettings } from "@/components/settings/watchlist-settings";
import { SportsSettings } from "@/components/settings/sports-settings";
import { AppearanceSettings } from "@/components/settings/appearance-settings";
import type { SportsFavorite } from "@/lib/sync/sports";

async function updateProfile(key: string, value: string) {
  "use server";
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  await supabase
    .from("profile")
    .upsert({ user_id: user.id, key, value }, { onConflict: "user_id,key" });
  revalidatePath("/settings");
  revalidatePath("/dashboard");
}

async function deleteProfile(key: string) {
  "use server";
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  await supabase.from("profile").delete().eq("user_id", user.id).eq("key", key);
  revalidatePath("/settings");
  revalidatePath("/dashboard");
}

async function saveSportsFavorites(favorites: SportsFavorite[]) {
  "use server";
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  await supabase
    .from("profile")
    .upsert(
      { user_id: user.id, key: "sports_favorites", value: JSON.stringify(favorites) },
      { onConflict: "user_id,key" },
    );
  // Drop cached rows for any (team_id, league) pair no longer favorited
  const keep = new Set(favorites.map((f) => `${f.team_id}|${f.league}`));
  const { data: existing } = await supabase
    .from("sports_cache")
    .select("id,team_id,league")
    .eq("user_id", user.id);
  const orphanIds = (existing ?? [])
    .filter((r) => !keep.has(`${r.team_id}|${r.league}`))
    .map((r) => r.id);
  if (orphanIds.length > 0) {
    await supabase.from("sports_cache").delete().in("id", orphanIds);
  }
  revalidatePath("/settings");
  revalidatePath("/dashboard");
}

async function saveWatchlist(tickers: string[]) {
  "use server";
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  await supabase
    .from("profile")
    .upsert(
      { user_id: user.id, key: "stock_watchlist", value: JSON.stringify(tickers) },
      { onConflict: "user_id,key" },
    );
  revalidatePath("/settings");
}

export default async function SettingsPage() {
  const supabase = await createClient();
  const { data } = await supabase.from("profile").select("key,value");

  const values: Record<string, string> = {};
  for (const row of data ?? []) {
    values[row.key] = row.value;
  }

  const watchlist = JSON.parse(values["stock_watchlist"] ?? "[]") as string[];
  const sportsFavorites = JSON.parse(values["sports_favorites"] ?? "[]") as SportsFavorite[];

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="font-heading font-semibold" style={{ fontSize: 24, color: "var(--color-text)" }}>
          Settings
        </h1>
        <p className="mt-1" style={{ fontSize: 14, color: "var(--color-text-muted)" }}>
          Edit and save changes inline. Press Enter or click Save on any field.
        </p>
      </div>

      <AppearanceSettings />

      <ProfileForm
        values={values}
        updateAction={updateProfile}
        deleteAction={deleteProfile}
      />

      <WatchlistSettings
        watchlist={watchlist}
        saveAction={saveWatchlist}
        hasApiKey={!!process.env.POLYGON_API_KEY}
      />

      <SportsSettings
        favorites={sportsFavorites}
        saveAction={saveSportsFavorites}
      />
    </div>
  );
}
