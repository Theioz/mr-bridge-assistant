import type { SupabaseClient } from "@supabase/supabase-js";
import type { SportsCacheData, SportsProvider } from "./provider";
import { ESPN } from "./espn";
import { TheSportsDB } from "./thesportsdb";

export type SportsFavorite = {
  team_id: string;
  name: string;
  league: string;
  league_id: string;
  badge: string | null;
  color: string | null;
};

export interface SportsSyncResult {
  updated: number;
  failed: { team_id: string; error: string }[];
  removed: number;
}

export function getSportsProvider(): SportsProvider {
  // Default to ESPN (free, no key, no rate limit). Set SPORTS_PROVIDER=thesportsdb
  // to fall back to TheSportsDB (requires SPORTSDB_API_KEY for non-trivial use).
  if (process.env.SPORTS_PROVIDER === "thesportsdb") return TheSportsDB;
  return ESPN;
}

export async function syncSports(
  db: SupabaseClient,
  userId: string,
  favorites: SportsFavorite[],
): Promise<SportsSyncResult> {
  const provider = getSportsProvider();
  const failed: SportsSyncResult["failed"] = [];
  const rows: { user_id: string; team_id: string; league: string; data: SportsCacheData; fetched_at: string }[] = [];

  for (const fav of favorites) {
    try {
      const ref = { team_id: fav.team_id, league: fav.league, league_id: fav.league_id };
      const [upcoming, recent, standings] = await Promise.all([
        provider.getUpcoming(ref, 3),
        provider.getRecent(ref, 3),
        provider.getStandings(ref),
      ]);
      rows.push({
        user_id: userId,
        team_id: fav.team_id,
        league: fav.league,
        data: { upcoming, recent, standings },
        fetched_at: new Date().toISOString(),
      });
    } catch (e) {
      failed.push({ team_id: fav.team_id, error: (e as Error).message });
    }
  }

  if (rows.length > 0) {
    const { error } = await db
      .from("sports_cache")
      .upsert(rows, { onConflict: "user_id,team_id,league" });
    if (error) throw new Error(error.message);
  }

  // Evict cache rows for (team_id, league) pairs no longer in favorites
  const keep = new Set(favorites.map((f) => `${f.team_id}|${f.league}`));
  const { data: existing } = await db
    .from("sports_cache")
    .select("id,team_id,league")
    .eq("user_id", userId);
  const orphanIds = (existing ?? [])
    .filter((r: { id: string; team_id: string; league: string }) => !keep.has(`${r.team_id}|${r.league}`))
    .map((r: { id: string }) => r.id);
  let removed = 0;
  if (orphanIds.length > 0) {
    const { count } = await db
      .from("sports_cache")
      .delete({ count: "exact" })
      .in("id", orphanIds);
    removed = count ?? 0;
  }

  return { updated: rows.length, failed, removed };
}

export type { SportsCacheData } from "./provider";
