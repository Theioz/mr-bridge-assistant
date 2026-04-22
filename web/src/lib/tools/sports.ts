import { tool, jsonSchema } from "ai";
import { syncSports } from "@/lib/sync/sports";
import type { SportsCacheData } from "@/lib/sync/sports/provider";
import type { ToolContext } from "./_context";

export function buildSportsTools({ supabase, userId }: ToolContext) {
  return {
    get_sports_data: tool({
      description:
        "Get next game, last result, or standings for one of the user's favorite sports teams. Reads sports_cache first; falls back to a live TheSportsDB fetch when the cache is older than 12h or when the requested game is within 24h of now. Use when the user asks about a team's schedule, recent result, or standings.",
      inputSchema: jsonSchema<{
        team_name?: string;
        team_id?: string;
        query_type: "next_game" | "last_result" | "standings";
      }>({
        type: "object",
        required: ["query_type"],
        properties: {
          team_name: {
            type: "string",
            description:
              "Team name as the user said it (e.g. 'Warriors'). Matched case-insensitively against the user's favorites.",
          },
          team_id: {
            type: "string",
            description: "TheSportsDB team_id, if known (preferred over team_name).",
          },
          query_type: { type: "string", enum: ["next_game", "last_result", "standings"] },
        },
      }),
      execute: async ({ team_name, team_id, query_type }) => {
        const { data: favRow } = await supabase
          .from("profile")
          .select("value")
          .eq("user_id", userId)
          .eq("key", "sports_favorites")
          .maybeSingle();

        type Fav = {
          team_id: string;
          name: string;
          league: string;
          league_id: string;
          badge: string | null;
          color: string | null;
        };
        const favorites: Fav[] = favRow?.value ? (JSON.parse(favRow.value) as Fav[]) : [];
        if (favorites.length === 0) {
          return { error: "No favorite teams configured. Add some in Settings." };
        }

        const fav = team_id
          ? favorites.find((f) => f.team_id === team_id)
          : favorites.find((f) => f.name.toLowerCase().includes((team_name ?? "").toLowerCase()));
        if (!fav) {
          return {
            error: `Team not in favorites. Available: ${favorites.map((f) => f.name).join(", ")}`,
          };
        }

        const { data: cached } = await supabase
          .from("sports_cache")
          .select("data,fetched_at")
          .eq("user_id", userId)
          .eq("team_id", fav.team_id)
          .maybeSingle();

        const now = Date.now();
        const cacheAgeHrs = cached
          ? (now - new Date(cached.fetched_at).getTime()) / 3_600_000
          : Infinity;

        // Decide whether to live-fetch
        let needsLive = !cached || cacheAgeHrs > 12;
        if (cached && !needsLive) {
          const data = cached.data as SportsCacheData;
          if (query_type === "next_game") {
            const next = data.upcoming?.[0];
            if (next && Math.abs(new Date(next.start_time).getTime() - now) < 24 * 3_600_000)
              needsLive = true;
          }
          if (query_type === "last_result") {
            const last = data.recent?.[0];
            if (last && now - new Date(last.start_time).getTime() < 24 * 3_600_000)
              needsLive = true;
          }
        }

        let data: SportsCacheData;
        let source: "cache" | "live" | "stale-cache" = "cache";

        if (needsLive) {
          try {
            await syncSports(supabase, userId, [fav]);
            const { data: fresh } = await supabase
              .from("sports_cache")
              .select("data")
              .eq("user_id", userId)
              .eq("team_id", fav.team_id)
              .maybeSingle();
            data = (fresh?.data ?? cached?.data) as SportsCacheData;
            source = "live";
          } catch (e) {
            if (!cached)
              return { error: `Live fetch failed and no cache: ${(e as Error).message}` };
            data = cached.data as SportsCacheData;
            source = "stale-cache";
          }
        } else {
          data = cached!.data as SportsCacheData;
        }

        if (query_type === "next_game") {
          return {
            team: fav.name,
            league: fav.league,
            next_game: data.upcoming?.[0] ?? null,
            source,
          };
        }
        if (query_type === "last_result") {
          return {
            team: fav.name,
            league: fav.league,
            last_result: data.recent?.[0] ?? null,
            source,
          };
        }
        return { team: fav.name, league: fav.league, standings: data.standings ?? null, source };
      },
    }),
  };
}
