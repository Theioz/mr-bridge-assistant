export const dynamic = "force-dynamic";

import { Suspense } from "react";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { ProfileForm } from "@/components/settings/profile-form";

export const metadata: Metadata = {
  title: "Settings",
  description: "Appearance, profile, location, watchlist, and sports favorites.",
};
import { WatchlistSettings } from "@/components/settings/watchlist-settings";
import { SportsSettings } from "@/components/settings/sports-settings";
import { AppearanceSettings } from "@/components/settings/appearance-settings";
import { FitnessSettings } from "@/components/settings/fitness-settings";
import { IntegrationsSettings } from "@/components/settings/integrations-settings";
import {
  EquipmentSettings,
  type EquipmentItemInput,
} from "@/components/settings/equipment-settings";
import { createServiceClient } from "@/lib/supabase/service";
import { loadIntegration, storeIntegration, deleteIntegration } from "@/lib/integrations/tokens";
import { lastSyncStatus } from "@/lib/sync/log";
import type { SportsFavorite } from "@/lib/sync/sports";
import { SettingsTabs, type SettingsTab } from "@/components/settings/settings-tabs";
import { DataSettings } from "@/components/settings/data-settings";
import { UsageSettings } from "@/components/settings/usage-settings";

const VALID_TABS = new Set<string>([
  "profile",
  "fitness",
  "integrations",
  "watchlists",
  "appearance",
  "data",
  "usage",
]);

async function updateProfile(key: string, value: string) {
  "use server";
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
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
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;
  await supabase.from("profile").delete().eq("user_id", user.id).eq("key", key);
  revalidatePath("/settings");
  revalidatePath("/dashboard");
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
  revalidatePath("/settings");
}

async function addEquipment(item: EquipmentItemInput) {
  "use server";
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;
  await supabase
    .from("user_equipment")
    .upsert(
      { user_id: user.id, ...item, updated_at: new Date().toISOString() },
      { onConflict: "user_id,equipment_type,weight_lbs,resistance_level" },
    );
  revalidatePath("/settings");
}

async function removeEquipment(id: string) {
  "use server";
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;
  await supabase.from("user_equipment").delete().eq("id", id).eq("user_id", user.id);
  revalidatePath("/settings");
}

async function disconnectGoogle() {
  "use server";
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;
  const db = createServiceClient();
  await deleteIntegration(db, user.id, "google");
  revalidatePath("/settings");
}

async function saveOuraToken(pat: string) {
  "use server";
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;
  const trimmed = pat.trim();
  if (!trimmed) return;
  const db = createServiceClient();
  await storeIntegration(db, user.id, "oura", {
    refreshToken: trimmed,
    scopes: ["daily", "workout", "sleep"],
  });
  revalidatePath("/settings");
}

async function disconnectOura() {
  "use server";
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;
  const db = createServiceClient();
  await deleteIntegration(db, user.id, "oura");
  revalidatePath("/settings");
}

async function disconnectFitbit() {
  "use server";
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;
  const db = createServiceClient();
  await deleteIntegration(db, user.id, "fitbit");
  revalidatePath("/settings");
}

async function SettingsContent({
  params,
  activeTab,
}: {
  params: Record<string, string>;
  activeTab: SettingsTab;
}) {
  if (activeTab === "appearance") {
    return <AppearanceSettings />;
  }

  if (activeTab === "data") {
    return <DataSettings />;
  }

  if (activeTab === "usage") {
    return <UsageSettings />;
  }

  const supabase = await createClient();
  const db = createServiceClient();

  if (activeTab === "integrations") {
    // Wave 1 — only need the authenticated user
    const {
      data: { user },
    } = await supabase.auth.getUser();

    // Wave 2 — all integration loads and sync statuses in parallel
    const [
      googleIntegration,
      ouraIntegration,
      fitbitIntegration,
      googleLastSync,
      ouraLastSync,
      fitbitLastSync,
    ] = await Promise.all([
      user ? loadIntegration(db, user.id, "google").catch((): null => null) : Promise.resolve(null),
      user ? loadIntegration(db, user.id, "oura").catch((): null => null) : Promise.resolve(null),
      user ? loadIntegration(db, user.id, "fitbit").catch((): null => null) : Promise.resolve(null),
      lastSyncStatus(db, "google_fit").catch((): null => null),
      lastSyncStatus(db, "oura").catch((): null => null),
      lastSyncStatus(db, "fitbit").catch((): null => null),
    ]);

    return (
      <IntegrationsSettings
        googleIntegration={googleIntegration}
        disconnectAction={disconnectGoogle}
        googleLastSync={googleLastSync}
        ouraIntegration={ouraIntegration}
        saveOuraTokenAction={saveOuraToken}
        disconnectOuraAction={disconnectOura}
        ouraLastSync={ouraLastSync}
        fitbitIntegration={fitbitIntegration}
        disconnectFitbitAction={disconnectFitbit}
        fitbitLastSync={fitbitLastSync}
        errorParam={params.error}
      />
    );
  }

  // profile, fitness, watchlists — all need the profile table
  const profilePromise = supabase.from("profile").select("key,value");
  const equipmentPromise =
    activeTab === "fitness"
      ? supabase
          .from("user_equipment")
          .select("id,equipment_type,weight_lbs,resistance_level,count,notes")
          .order("equipment_type")
      : Promise.resolve({
          data: [] as {
            id: string;
            equipment_type: string;
            weight_lbs: number | null;
            resistance_level: string | null;
            count: number;
            notes: string | null;
          }[],
        });

  const [{ data }, { data: equipmentData }] = await Promise.all([profilePromise, equipmentPromise]);

  const values: Record<string, string> = {};
  for (const row of data ?? []) {
    values[row.key] = row.value;
  }

  if (activeTab === "profile") {
    return (
      <ProfileForm values={values} updateAction={updateProfile} deleteAction={deleteProfile} />
    );
  }

  if (activeTab === "fitness") {
    return (
      <>
        <FitnessSettings
          restTimerEnabled={values["rest_timer_enabled"] !== "0"}
          updateAction={updateProfile}
        />
        <EquipmentSettings
          items={equipmentData ?? []}
          addAction={addEquipment}
          removeAction={removeEquipment}
        />
      </>
    );
  }

  // activeTab === "watchlists"
  const watchlist = JSON.parse(values["stock_watchlist"] ?? "[]") as string[];
  const sportsFavorites = JSON.parse(values["sports_favorites"] ?? "[]") as SportsFavorite[];

  return (
    <>
      <WatchlistSettings
        watchlist={watchlist}
        saveAction={saveWatchlist}
        hasApiKey={!!process.env.POLYGON_API_KEY}
      />
      <SportsSettings favorites={sportsFavorites} saveAction={saveSportsFavorites} />
    </>
  );
}

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>;
}) {
  const params = await searchParams;
  const activeTab: SettingsTab = VALID_TABS.has(params.tab ?? "")
    ? (params.tab as SettingsTab)
    : "profile";

  return (
    <div className="max-w-2xl">
      <header style={{ marginBottom: "var(--space-2)" }}>
        <h1
          className="font-heading"
          style={{
            fontSize: "var(--t-h1)",
            fontWeight: 600,
            color: "var(--color-text)",
            letterSpacing: "-0.02em",
          }}
        >
          Settings
        </h1>
        <p
          className="mt-1"
          style={{ fontSize: "var(--t-micro)", color: "var(--color-text-muted)" }}
        >
          Edit and save changes inline. Press Enter or click Save on any field.
        </p>
      </header>

      <SettingsTabs activeTab={activeTab} />

      <Suspense fallback={<div style={{ minHeight: 400 }} />}>
        <SettingsContent activeTab={activeTab} params={params} />
      </Suspense>
    </div>
  );
}
