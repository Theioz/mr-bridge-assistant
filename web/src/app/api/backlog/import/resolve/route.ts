import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { findByImdbIds } from "@/lib/backlog/tmdb";
import type { ParsedImportRow, ResolvedRow, RowProblem } from "@/lib/import/media-csv";
import type { MediaType } from "@/lib/types";

// One chunk of a client-driven import (#690). The client parses the CSV, sends rows in
// batches so the preview stays interactive, and this resolves each batch against TMDB
// without writing anything. All writes happen once, in POST /api/backlog/import.
export const maxDuration = 60;

const MAX_ROWS = 50;

const PROBLEM_REASONS: Record<RowProblem, string> = {
  unsupported_type: "Not a movie or show",
  episode: "Single episode — the library tracks whole shows",
  missing_id: "No IMDb id in this row",
  duplicate_in_file: "Listed earlier in the same file",
};

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const rows = body?.rows as ParsedImportRow[] | undefined;
  if (!Array.isArray(rows)) {
    return NextResponse.json({ error: "rows must be an array" }, { status: 400 });
  }
  if (rows.length > MAX_ROWS) {
    return NextResponse.json({ error: `At most ${MAX_ROWS} rows per request` }, { status: 400 });
  }

  // Rows the parser already rejected never reach TMDB.
  const resolvable = rows.filter((r) => r.problem === null && r.media_type && r.external_ref);

  let matches: Awaited<ReturnType<typeof findByImdbIds>>;
  try {
    matches = await findByImdbIds([...new Set(resolvable.map((r) => r.external_ref))]);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Lookup failed";
    return NextResponse.json({ error: msg }, { status: 502 });
  }

  // One duplicate query for the whole chunk instead of one per row.
  const tmdbIds = [
    ...new Set([...matches.values()].filter(Boolean).map((m) => m!.result.external_id)),
  ];
  const existing = new Map<string, string>();
  if (tmdbIds.length > 0) {
    const { data, error } = await supabase
      .from("backlog_items")
      .select("id, external_id, media_type")
      .eq("user_id", user.id)
      .in("external_id", tmdbIds);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    for (const row of data ?? []) existing.set(`${row.media_type}:${row.external_id}`, row.id);
  }

  const resolved: ResolvedRow[] = rows.map((row) => {
    const base = { line: row.line, external_ref: row.external_ref, source_title: row.title };

    if (row.problem) {
      return { ...base, outcome: "skipped" as const, reason: PROBLEM_REASONS[row.problem] };
    }

    const match = matches.get(row.external_ref);
    if (!match) {
      return { ...base, outcome: "unmatched" as const, reason: "TMDB has no record of this id" };
    }

    // TMDB's own answer wins over the CSV's kind — it is the one that knows which of its
    // catalogues the id actually lives in.
    const media_type: MediaType = match.media_type;
    const key = `${media_type}:${match.result.external_id}`;
    const existing_id = existing.get(key);
    if (existing_id) {
      return {
        ...base,
        outcome: "duplicate" as const,
        reason: "Already in your library",
        existing_id,
      };
    }

    const { result } = match;
    const rated = row.rating !== null && row.rating !== undefined;

    return {
      ...base,
      outcome: "matched" as const,
      item: {
        media_type,
        title: result.title || row.title,
        // /find carries no director and no runtime; the export does, so it fills the gaps.
        creator: result.creator || row.creator || null,
        release_date: result.release_date,
        description: result.description || null,
        cover_url: result.cover_url || null,
        external_id: result.external_id,
        external_source: result.external_source,
        metadata: {
          ...result.metadata,
          ...(row.runtime_minutes && !(result.metadata as Record<string, unknown>).runtime_minutes
            ? { runtime_minutes: row.runtime_minutes }
            : {}),
          imported_from: "imdb",
          imdb_id: row.external_ref,
        },
        // A rating is a record of having watched it; an unrated row is still a want-to-watch.
        status: rated ? "finished" : "backlog",
        rating: rated ? row.rating : null,
        review: row.note ?? null,
        finished_at: rated && row.rated_at ? row.rated_at : null,
      },
    };
  });

  return NextResponse.json({ resolved });
}
