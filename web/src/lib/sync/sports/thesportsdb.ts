import type { Game, SportsProvider, Standing, Team } from "./provider";

const BASE = "https://www.thesportsdb.com/api/v1/json";

type RawTeam = {
  idTeam: string;
  strTeam: string;
  strLeague: string;
  idLeague: string;
  strBadge?: string | null;
  strTeamBadge?: string | null;
};

type RawEvent = {
  idEvent: string;
  strHomeTeam: string;
  strAwayTeam: string;
  idHomeTeam: string;
  idAwayTeam: string;
  strHomeTeamBadge?: string | null;
  strAwayTeamBadge?: string | null;
  intHomeScore: string | null;
  intAwayScore: string | null;
  strTimestamp: string | null;
  dateEvent: string | null;
  strTime: string | null;
  strStatus?: string | null;
};

type RawStanding = {
  idTeam: string;
  intRank: string | null;
  strGroup?: string | null;
  strDivision?: string | null;
  intWin: string | null;
  intLoss: string | null;
  intDraw: string | null;
  intPoints: string | null;
};

function apiKey(): string {
  return process.env.SPORTSDB_API_KEY || "3"; // "3" is the public test key
}

async function sportsDbGet<T>(path: string): Promise<T | null> {
  const url = `${BASE}/${apiKey()}${path}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    console.error(`[sports] thesportsdb ${path} returned ${res.status}`);
    return null;
  }
  return res.json() as Promise<T>;
}

function badge(t: Pick<RawTeam, "strBadge" | "strTeamBadge">): string | null {
  return t.strBadge ?? t.strTeamBadge ?? null;
}

function startTime(e: RawEvent): string {
  if (e.strTimestamp) return new Date(e.strTimestamp).toISOString();
  if (e.dateEvent) {
    const time = e.strTime ?? "00:00:00";
    return new Date(`${e.dateEvent}T${time}Z`).toISOString();
  }
  return new Date().toISOString();
}

function toGame(e: RawEvent, teamId: string): Game {
  const isHome = e.idHomeTeam === teamId;
  const opponent = isHome ? e.strAwayTeam : e.strHomeTeam;
  const opponentBadge = isHome ? (e.strAwayTeamBadge ?? null) : (e.strHomeTeamBadge ?? null);
  const homeScore = e.intHomeScore != null ? parseInt(e.intHomeScore, 10) : null;
  const awayScore = e.intAwayScore != null ? parseInt(e.intAwayScore, 10) : null;
  const isFinal = homeScore != null && awayScore != null;

  let teamScore: number | null = null;
  let oppScore: number | null = null;
  let result: Game["result"] = null;
  if (isFinal) {
    teamScore = isHome ? homeScore : awayScore;
    oppScore = isHome ? awayScore : homeScore;
    result = teamScore > oppScore ? "W" : teamScore < oppScore ? "L" : "T";
  }

  return {
    game_id: e.idEvent,
    opponent,
    opponent_badge: opponentBadge,
    home_away: isHome ? "home" : "away",
    start_time: startTime(e),
    status: isFinal ? "final" : "scheduled",
    score: isFinal ? { team: teamScore!, opponent: oppScore! } : null,
    result,
  };
}

function currentSeason(league: string): string {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth() + 1;
  const upper = league.toUpperCase();
  // Cross-year leagues — split season string "YYYY-YYYY"
  if (
    upper.includes("NBA") ||
    upper.includes("NHL") ||
    upper.includes("NFL") ||
    upper.includes("PREMIER") ||
    upper.includes("LIGA") ||
    upper.includes("BUNDES") ||
    upper.includes("SERIE A") ||
    upper.includes("LIGUE 1")
  ) {
    // Most start ~Aug-Oct, end ~Apr-Jun
    if (m >= 7) return `${y}-${y + 1}`;
    return `${y - 1}-${y}`;
  }
  // Single-year (MLB, MLS)
  return `${y}`;
}

export const TheSportsDB: SportsProvider = {
  async searchTeams(query: string): Promise<Team[]> {
    const json = await sportsDbGet<{ teams: RawTeam[] | null }>(
      `/searchteams.php?t=${encodeURIComponent(query)}`,
    );
    const teams = json?.teams ?? [];
    return teams.map((t) => ({
      team_id: t.idTeam,
      name: t.strTeam,
      league: t.strLeague,
      league_id: t.idLeague,
      badge: badge(t),
      color: null,
    }));
  },

  async getUpcoming({ team_id }, limit = 3): Promise<Game[]> {
    const json = await sportsDbGet<{ events: RawEvent[] | null }>(
      `/eventsnext.php?id=${encodeURIComponent(team_id)}`,
    );
    const events = (json?.events ?? []).filter(
      (e) => e.idHomeTeam === team_id || e.idAwayTeam === team_id,
    );
    return events.slice(0, limit).map((e) => toGame(e, team_id));
  },

  async getRecent({ team_id }, limit = 3): Promise<Game[]> {
    const json = await sportsDbGet<{ results: RawEvent[] | null }>(
      `/eventslast.php?id=${encodeURIComponent(team_id)}`,
    );
    const events = (json?.results ?? []).filter(
      (e) => e.idHomeTeam === team_id || e.idAwayTeam === team_id,
    );
    return events
      .map((e) => toGame(e, team_id))
      .sort((a, b) => b.start_time.localeCompare(a.start_time))
      .slice(0, limit);
  },

  async getStandings({ team_id, league, league_id }): Promise<Standing | null> {
    const seasons = [currentSeason(league)];
    // Fallback: try previous season if current returns nothing (off-season)
    const fallback = currentSeason(league).includes("-")
      ? null
      : `${parseInt(currentSeason(league), 10) - 1}`;
    if (fallback) seasons.push(fallback);

    for (const season of seasons) {
      const json = await sportsDbGet<{ table: RawStanding[] | null }>(
        `/lookuptable.php?l=${encodeURIComponent(league_id)}&s=${encodeURIComponent(season)}`,
      );
      const row = json?.table?.find((r) => r.idTeam === team_id);
      if (row) {
        const wins = parseInt(row.intWin ?? "0", 10) || 0;
        const losses = parseInt(row.intLoss ?? "0", 10) || 0;
        const ties = row.intDraw != null ? parseInt(row.intDraw, 10) : null;
        const points = row.intPoints != null ? parseInt(row.intPoints, 10) : null;
        const games = wins + losses + (ties ?? 0);
        const pct = games > 0 && (points == null || ties == null) ? wins / games : null;
        return {
          rank: row.intRank != null ? parseInt(row.intRank, 10) : null,
          group: row.strGroup ?? row.strDivision ?? league,
          wins,
          losses,
          ties,
          points,
          pct,
        };
      }
    }
    return null;
  },
};
