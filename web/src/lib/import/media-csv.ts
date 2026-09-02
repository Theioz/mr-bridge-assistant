// Column-map driven CSV import for the library (#690).
//
// Every list site exports the same shape — one row per title, an external id, a kind
// label, and an optional personal rating — so a source is a column map plus a kind
// translator. IMDb ships first; Letterboxd/Goodreads/Steam are additional entries here,
// not additional parsers.

import type { MediaType } from "@/lib/types";
import { parseCsv } from "./csv";

export type ImportSourceId = "imdb";

/** Why a row cannot be imported. Null means the row is fine. */
export type RowProblem =
  | "unsupported_type" // the source's kind has no library equivalent
  | "episode" // a single episode — the library tracks whole shows
  | "missing_id" // no external id to resolve against
  | "duplicate_in_file"; // an earlier row in the same file already claimed this id

export interface ParsedImportRow {
  /** 1-based position in the file, so the preview can point at a line. */
  line: number;
  /** The source's own id — an IMDb const like "tt0111161". */
  external_ref: string;
  title: string;
  year: number | null;
  /** Null when the row cannot be mapped; `problem` says why. */
  media_type: MediaType | null;
  /** The source's raw kind label, kept verbatim for the unmatched report. */
  kind: string;
  /** 0–10, matching backlog_items.rating's own domain. */
  rating: number | null;
  /** YYYY-MM-DD, when the source records one. */
  rated_at: string | null;
  creator: string | null;
  runtime_minutes: number | null;
  /** The user's own note on the row, if the export carries one. */
  note: string | null;
  problem: RowProblem | null;
}

export interface ImportSource {
  id: ImportSourceId;
  label: string;
  /** All of these must appear in the header for a file to be recognised as this source. */
  required_headers: string[];
  columns: {
    external_ref: string;
    title: string;
    kind: string;
    year?: string;
    rating?: string;
    rated_at?: string;
    creator?: string;
    runtime?: string;
    note?: string;
  };
  /** Fold a kind label to a library media_type, or say why it has none. */
  kind_to_media_type: (kind: string) => MediaType | RowProblem;
}

/**
 * IMDb writes its kind labels two ways depending on the export — a ratings export says
 * "TV Mini Series", an older watchlist export says "tvMiniSeries". Folding to lowercase
 * alphanumerics collapses both onto one key.
 */
function foldKind(kind: string): string {
  return kind.toLowerCase().replace(/[^a-z0-9]/g, "");
}

const IMDB_KINDS: Record<string, MediaType | RowProblem> = {
  movie: "movie",
  tvmovie: "movie", // TMDB files these under movie_results too
  tvseries: "show",
  tvminiseries: "show",
  tvepisode: "episode",
};

export const IMPORT_SOURCES: Record<ImportSourceId, ImportSource> = {
  imdb: {
    id: "imdb",
    label: "IMDb",
    // Const + Title Type are unique to IMDb and present in every export it produces.
    required_headers: ["Const", "Title Type"],
    columns: {
      external_ref: "Const",
      title: "Title",
      kind: "Title Type",
      year: "Year",
      rating: "Your Rating",
      rated_at: "Date Rated",
      creator: "Directors",
      runtime: "Runtime (mins)",
      // List exports carry the user's own note here; ratings exports omit the column.
      note: "Description",
    },
    kind_to_media_type: (kind) => IMDB_KINDS[foldKind(kind)] ?? "unsupported_type",
  },
};

function get(row: Record<string, string>, col: string | undefined): string {
  return col ? (row[col] ?? "") : "";
}

function toInt(value: string): number | null {
  if (!value) return null;
  // IMDb writes runtimes as plain integers, but vote-style columns can carry separators.
  const n = Number(value.replace(/,/g, ""));
  return Number.isFinite(n) ? Math.round(n) : null;
}

function toRating(value: string): number | null {
  if (!value) return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0 || n > 10) return null;
  // backlog_items.rating is numeric(3,1) — one decimal is all that survives a round trip.
  return Math.round(n * 10) / 10;
}

function toIsoDate(value: string): string | null {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

/** Does this header row look like the named source? */
export function detectSource(headers: string[]): ImportSource | null {
  const present = new Set(headers.map((h) => h.trim()));
  for (const source of Object.values(IMPORT_SOURCES)) {
    if (source.required_headers.every((h) => present.has(h))) return source;
  }
  return null;
}

export interface ParseResult {
  source: ImportSource;
  rows: ParsedImportRow[];
}

export class ImportParseError extends Error {}

/**
 * Parse an export into library-shaped rows. Rows that cannot be imported are returned
 * with `problem` set rather than dropped — the caller reports them.
 */
export function parseMediaCsv(text: string, sourceId?: ImportSourceId): ParseResult {
  const { headers, rows } = parseCsv(text);
  if (headers.length === 0) throw new ImportParseError("The file is empty.");

  const source = sourceId ? IMPORT_SOURCES[sourceId] : detectSource(headers);
  if (!source) {
    throw new ImportParseError(
      "This does not look like an IMDb export — no “Const” and “Title Type” columns.",
    );
  }

  const cols = source.columns;
  const seen = new Set<string>();

  const parsed = rows.map((row, i): ParsedImportRow => {
    const external_ref = get(row, cols.external_ref);
    const kind = get(row, cols.kind);
    const mapped = source.kind_to_media_type(kind);
    const isMediaType =
      mapped === "movie" || mapped === "show" || mapped === "game" || mapped === "book";

    let problem: RowProblem | null = isMediaType ? null : (mapped as RowProblem);
    if (!external_ref) problem = "missing_id";
    else if (problem === null) {
      // Only importable rows claim an id, so an unsupported row never shadows a good one.
      if (seen.has(external_ref)) problem = "duplicate_in_file";
      else seen.add(external_ref);
    }

    return {
      line: i + 2, // +1 for the header, +1 to count from one
      external_ref,
      title: get(row, cols.title),
      year: toInt(get(row, cols.year)),
      media_type: isMediaType ? (mapped as MediaType) : null,
      kind,
      rating: toRating(get(row, cols.rating)),
      rated_at: toIsoDate(get(row, cols.rated_at)),
      creator: get(row, cols.creator) || null,
      runtime_minutes: toInt(get(row, cols.runtime)),
      note: get(row, cols.note) || null,
      problem,
    };
  });

  return { source, rows: parsed };
}

// ── Resolution ────────────────────────────────────────────────────────────────
// The wire shape between POST /api/backlog/import/resolve and the import UI.

export type ResolveOutcome = "matched" | "duplicate" | "unmatched" | "skipped";

export interface ResolvedRow {
  line: number;
  external_ref: string;
  /** The title as the export spells it, so an unmatched row is still recognisable. */
  source_title: string;
  outcome: ResolveOutcome;
  reason?: string;
  /** Set on `duplicate` — the library row this would have collided with. */
  existing_id?: string;
  /** Set on `matched` — the exact body to hand to POST /api/backlog/import. */
  item?: Record<string, unknown>;
}

export const OUTCOME_LABELS: Record<ResolveOutcome, string> = {
  matched: "Ready",
  duplicate: "Already in library",
  unmatched: "Not found on TMDB",
  skipped: "Skipped",
};
