export type Team = {
  team_id: string;
  name: string;
  league: string;
  league_id: string;
  badge: string | null;
  color: string | null; // hex, used for fallback badge when no logo (e.g. F1)
};

export type Game = {
  game_id: string;
  opponent: string;
  opponent_badge: string | null;
  home_away: "home" | "away";
  start_time: string;
  status: "scheduled" | "final" | "in_progress";
  score: { team: number; opponent: number } | null;
  result: "W" | "L" | "T" | null;
};

export type Standing = {
  rank: number | null;
  group: string;
  wins: number;
  losses: number;
  ties: number | null;
  points: number | null;
  pct: number | null;
};

export type SportsCacheData = {
  upcoming: Game[];
  recent: Game[];
  standings: Standing | null;
};

export type TeamRef = { team_id: string; league: string; league_id: string };

export interface SportsProvider {
  searchTeams(query: string): Promise<Team[]>;
  getUpcoming(team: TeamRef, limit?: number): Promise<Game[]>;
  getRecent(team: TeamRef, limit?: number): Promise<Game[]>;
  getStandings(team: TeamRef): Promise<Standing | null>;
}
