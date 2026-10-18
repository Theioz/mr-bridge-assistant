import type { BacklogItem, BacklogStatus, MediaType } from "@/lib/types";

export interface ImportExtras {
  status: BacklogStatus;
  rating: number | null;
  review: string | null;
  platform: string | null;
  price_paid: number | null;
  session: { started_at: string | null; finished_at: string | null; notes: string | null } | null;
}

// ── Types ─────────────────────────────────────────────────────────────────────

export type Tab = "all" | MediaType;
export type SortKey = "priority" | "title" | "release_date" | "rating";
export type ViewMode = "list" | "grid";

export const TABS: { id: Tab; label: string }[] = [
  { id: "all", label: "All" },
  { id: "game", label: "Games" },
  { id: "show", label: "Shows" },
  { id: "movie", label: "Movies" },
  { id: "book", label: "Books" },
];

export const MEDIA_LABELS: Record<string, string> = {
  game: "Game",
  show: "Show",
  movie: "Movie",
  book: "Book",
};

export const STATUS_LABELS: Record<string, string> = {
  backlog: "Queued",
  active: "Active",
  paused: "Paused",
  finished: "Finished",
  dropped: "Dropped",
};

// Status colours on shared tokens (#761). Active owns the one amber accent; paused used to be
// a second amber that collided with it (--color-primary aliases --accent), so it is now a muted
// neutral. Finished / dropped are the semantic positive / danger tokens.
export const STATUS_COLORS: Record<string, string> = {
  backlog: "var(--color-text-faint)",
  active: "var(--accent)",
  paused: "var(--color-text-muted)",
  finished: "var(--color-positive)",
  dropped: "var(--color-danger)",
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function toTitleCase(s: string): string {
  return s.replace(/\b\w/g, (c) => c.toUpperCase());
}

export function getGenres(item: BacklogItem): string[] {
  const m = item.metadata as Record<string, unknown> | null;
  if (!m) return [];
  if (Array.isArray(m.genres)) {
    return (m.genres as Array<string | { name?: string }>)
      .map((g) => toTitleCase(typeof g === "string" ? g : (g.name ?? "")))
      .filter(Boolean)
      .slice(0, 4);
  }
  return [];
}

export function buildApiUrl(
  tab: Tab,
  q: string | null,
  status: string | null,
  year: string | null,
  offset: number,
  limit = 50,
): string {
  const params = new URLSearchParams();
  params.set("limit", String(limit));
  params.set("offset", String(offset));
  if (tab !== "all") params.set("type", tab);
  if (status) params.set("status", status);
  if (q) params.set("q", q);
  if (year) params.set("year", year);
  return `/api/backlog?${params.toString()}`;
}
