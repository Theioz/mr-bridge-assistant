import type { Game, SportsProvider, Standing, Team } from "./provider";

const SITE_BASE = "https://site.api.espn.com/apis/site/v2";
const CORE_BASE = "https://site.api.espn.com/apis/v2";

// Supported leagues. league_id is ESPN's "{sport}/{league}" path.
const LEAGUES: { league_id: string; display: string }[] = [
  { league_id: "basketball/nba", display: "NBA" },
  { league_id: "football/nfl", display: "NFL" },
  { league_id: "baseball/mlb", display: "MLB" },
  { league_id: "hockey/nhl", display: "NHL" },
  { league_id: "racing/f1", display: "F1" },
];

function displayFor(leagueId: string): string {
  return LEAGUES.find((l) => l.league_id === leagueId)?.display ?? leagueId;
}

function isF1(leagueId: string): boolean {
  return leagueId === "racing/f1";
}

async function get<T>(url: string): Promise<T | null> {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    console.error(`[sports/espn] ${url} → ${res.status}`);
    return null;
  }
  return res.json() as Promise<T>;
}

// ── Types (only the fields we use) ───────────────────────────────────────────
type RawTeamsResponse = {
  sports: {
    leagues: {
      teams: { team: { id: string; displayName: string; abbreviation?: string; color?: string; logos?: { href: string }[] } }[];
    }[];
  }[];
};

type RawCompetitor = {
  id: string;
  homeAway?: "home" | "away";
  winner?: boolean;
  score?: string | { value?: number; displayValue?: string };
  team?: { id: string; displayName: string; abbreviation?: string; logo?: string; logos?: { href: string }[] };
  athlete?: { displayName: string };
};

type RawEvent = {
  id: string;
  date: string;
  name: string;
  shortName?: string;
  competitions: {
    competitors: RawCompetitor[];
    status: { type: { state: "pre" | "in" | "post"; completed: boolean } };
  }[];
};

type RawStandingEntry = {
  team: { id: string; displayName: string };
  stats: { name: string; value?: number; displayValue?: string }[];
};

type RawStandingNode = {
  name?: string;
  abbreviation?: string;
  standings?: { entries?: RawStandingEntry[] };
  children?: RawStandingNode[];
};

// Helpers
function parseScore(s: RawCompetitor["score"]): number | null {
  if (s == null) return null;
  if (typeof s === "string") {
    const n = parseInt(s, 10);
    return Number.isFinite(n) ? n : null;
  }
  if (typeof s === "object") {
    if (typeof s.value === "number") return s.value;
    if (s.displayValue) {
      const n = parseInt(s.displayValue, 10);
      return Number.isFinite(n) ? n : null;
    }
  }
  return null;
}

function teamLogo(t: NonNullable<RawCompetitor["team"]>): string | null {
  return t.logo ?? t.logos?.[0]?.href ?? null;
}

function statValue(stats: RawStandingEntry["stats"], name: string): number | null {
  const s = stats.find((x) => x.name === name);
  if (!s) return null;
  if (typeof s.value === "number") return s.value;
  if (s.displayValue) {
    const n = parseFloat(s.displayValue);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function findStandingEntry(
  root: RawStandingNode,
  teamId: string,
): { entry: RawStandingEntry; group: string } | null {
  const stack: { node: RawStandingNode; group: string }[] = [{ node: root, group: root.name ?? "" }];
  while (stack.length) {
    const { node, group } = stack.pop()!;
    if (node.standings?.entries) {
      const entry = node.standings.entries.find((e) => e.team.id === teamId);
      if (entry) return { entry, group: node.name ?? group };
    }
    for (const child of node.children ?? []) {
      stack.push({ node: child, group: child.name ?? group });
    }
  }
  return null;
}

// ── Season helpers ───────────────────────────────────────────────────────────
function currentSeason(leagueId: string): number {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth() + 1;
  switch (leagueId) {
    case "basketball/nba": // ESPN uses END year (Oct'24-Jun'25 = season=2025)
    case "hockey/nhl":
      return m >= 7 ? y + 1 : y;
    case "football/nfl": // ESPN uses START year (Sep'25-Feb'26 = season=2025)
      return m >= 8 ? y : y - 1;
    case "baseball/mlb":
    case "racing/f1":
    default:
      return y;
  }
}

// ── Game mapping for stick-and-ball leagues ─────────────────────────────────
function toGame(e: RawEvent, teamId: string): Game | null {
  const c = e.competitions?.[0];
  if (!c) return null;
  const me = c.competitors.find((x) => x.team?.id === teamId);
  const opp = c.competitors.find((x) => x.team?.id !== teamId);
  if (!me || !opp || !opp.team) return null;

  const completed = c.status.type.completed;
  const myScore = parseScore(me.score);
  const oppScore = parseScore(opp.score);
  const isFinal = completed && myScore != null && oppScore != null;

  let result: Game["result"] = null;
  if (isFinal) {
    if (me.winner === true) result = "W";
    else if (opp.winner === true) result = "L";
    else result = myScore > oppScore ? "W" : myScore < oppScore ? "L" : "T";
  }

  return {
    game_id: e.id,
    opponent: opp.team.displayName,
    opponent_badge: teamLogo(opp.team),
    home_away: (me.homeAway ?? "home") === "home" ? "home" : "away",
    start_time: e.date,
    status: c.status.type.state === "in" ? "in_progress" : isFinal ? "final" : "scheduled",
    score: isFinal ? { team: myScore!, opponent: oppScore! } : null,
    result,
  };
}

// ── F1 mapping: races as Games (no opponent/score) ──────────────────────────
function toRaceGame(e: RawEvent): Game {
  const c = e.competitions?.[0];
  return {
    game_id: e.id,
    opponent: e.name, // race name (e.g. "Australian Grand Prix")
    opponent_badge: null,
    home_away: "home", // suppressed in UI when league=F1
    start_time: e.date,
    status: c?.status.type.state === "in" ? "in_progress" : c?.status.type.completed ? "final" : "scheduled",
    score: null,
    result: null,
  };
}

// ── Fetch all teams across all supported leagues (used for search) ──────────
async function fetchAllTeams(): Promise<Team[]> {
  const lists = await Promise.all(
    LEAGUES.map(async ({ league_id, display }) => {
      const json = await get<RawTeamsResponse>(`${SITE_BASE}/sports/${league_id}/teams`);
      const teams = json?.sports?.[0]?.leagues?.[0]?.teams ?? [];
      return teams.map<Team>((t) => ({
        team_id: t.team.id,
        name: t.team.displayName,
        league: display,
        league_id,
        badge: t.team.logos?.[0]?.href ?? null,
        color: t.team.color ? `#${t.team.color.replace(/^#/, "")}` : null,
      }));
    }),
  );
  return lists.flat();
}

export const ESPN: SportsProvider = {
  async searchTeams(query: string): Promise<Team[]> {
    const q = query.toLowerCase();
    const all = await fetchAllTeams();
    return all
      .filter((t) => t.name.toLowerCase().includes(q))
      .slice(0, 20);
  },

  async getUpcoming({ team_id, league_id }, limit = 3): Promise<Game[]> {
    return espnGetUpcoming(team_id, league_id, limit);
  },

  async getRecent({ team_id, league_id }, limit = 3): Promise<Game[]> {
    return espnGetRecent(team_id, league_id, limit);
  },

  async getStandings({ team_id, league_id }): Promise<Standing | null> {
    const json = await get<RawStandingNode>(`${CORE_BASE}/sports/${league_id}/standings`);
    if (!json) return null;

    if (isF1(league_id)) {
      // F1: find the Constructor Standings group
      const groups = json.children ?? [];
      const constructors = groups.find((g) =>
        (g.name ?? "").toLowerCase().includes("constructor") ||
        (g.name ?? "").toLowerCase().includes("manufacturer"),
      );
      if (!constructors?.standings?.entries) return null;
      const entry = constructors.standings.entries.find((e) => e.team.id === team_id);
      if (!entry) return null;
      return {
        rank: statValue(entry.stats, "rank"),
        group: "Constructors",
        wins: 0,
        losses: 0,
        ties: null,
        points: statValue(entry.stats, "points") ?? statValue(entry.stats, "championshipPts"),
        pct: null,
      };
    }

    const found = findStandingEntry(json, team_id);
    if (!found) return null;
    const { entry, group } = found;
    const wins = statValue(entry.stats, "wins") ?? 0;
    const losses = statValue(entry.stats, "losses") ?? 0;
    const ties = statValue(entry.stats, "ties");
    const points = statValue(entry.stats, "points");
    const pct = statValue(entry.stats, "winPercent");
    const rank = statValue(entry.stats, "playoffSeed") ?? statValue(entry.stats, "rank") ?? statValue(entry.stats, "divisionRank");

    return {
      rank: rank != null ? Math.round(rank) : null,
      group,
      wins: Math.round(wins),
      losses: Math.round(losses),
      ties: ties != null ? Math.round(ties) : null,
      points: points != null ? Math.round(points) : null,
      pct,
    };
  },
};

// Extra helpers used by syncSports — these need league context that the
// SportsProvider interface doesn't currently carry on getUpcoming/getRecent.
// We expose league-aware variants and let syncSports call them directly.
export async function espnGetUpcoming(
  team_id: string,
  league_id: string,
  limit = 3,
): Promise<Game[]> {
  if (isF1(league_id)) {
    const json = await get<{ events: RawEvent[] | null }>(
      `${SITE_BASE}/sports/racing/f1/scoreboard?dates=${currentSeason(league_id)}`,
    );
    const events = (json?.events ?? []).filter((e) => e.competitions?.[0]?.status.type.state !== "post");
    return events
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(0, limit)
      .map(toRaceGame);
  }

  const season = currentSeason(league_id);
  const json = await get<{ events: RawEvent[] | null }>(
    `${SITE_BASE}/sports/${league_id}/teams/${team_id}/schedule?season=${season}&seasontype=2`,
  );
  const events = (json?.events ?? []).filter(
    (e) => !e.competitions?.[0]?.status.type.completed,
  );
  const games: Game[] = [];
  for (const e of events) {
    const g = toGame(e, team_id);
    if (g) games.push(g);
  }
  return games.sort((a, b) => a.start_time.localeCompare(b.start_time)).slice(0, limit);
}

export async function espnGetRecent(
  team_id: string,
  league_id: string,
  limit = 3,
): Promise<Game[]> {
  if (isF1(league_id)) {
    const json = await get<{ events: RawEvent[] | null }>(
      `${SITE_BASE}/sports/racing/f1/scoreboard?dates=${currentSeason(league_id)}`,
    );
    const events = (json?.events ?? []).filter((e) => e.competitions?.[0]?.status.type.state === "post");
    return events
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, limit)
      .map(toRaceGame);
  }

  const season = currentSeason(league_id);
  const json = await get<{ events: RawEvent[] | null }>(
    `${SITE_BASE}/sports/${league_id}/teams/${team_id}/schedule?season=${season}&seasontype=2`,
  );
  const events = (json?.events ?? []).filter(
    (e) => e.competitions?.[0]?.status.type.completed,
  );
  const games: Game[] = [];
  for (const e of events) {
    const g = toGame(e, team_id);
    if (g) games.push(g);
  }
  return games.sort((a, b) => b.start_time.localeCompare(a.start_time)).slice(0, limit);
}

export { displayFor as espnLeagueDisplay };
