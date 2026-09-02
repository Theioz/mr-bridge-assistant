import type { MetadataSearchResult } from "@/lib/types";

const BASE = "https://api.themoviedb.org/3";
const IMG = "https://image.tmdb.org/t/p/w500";

// Combined movie + TV genre ID → name map
const TMDB_GENRES: Record<number, string> = {
  28: "Action",
  12: "Adventure",
  16: "Animation",
  35: "Comedy",
  80: "Crime",
  99: "Documentary",
  18: "Drama",
  10751: "Family",
  14: "Fantasy",
  36: "History",
  27: "Horror",
  10402: "Music",
  9648: "Mystery",
  10749: "Romance",
  878: "Sci-Fi",
  53: "Thriller",
  10752: "War",
  37: "Western",
  10759: "Action & Adventure",
  10762: "Kids",
  10763: "News",
  10764: "Reality",
  10765: "Sci-Fi & Fantasy",
  10766: "Soap",
  10767: "Talk",
  10768: "War & Politics",
};

function apiKey() {
  const key = process.env.TMDB_API_KEY;
  if (!key) throw new Error("TMDB_API_KEY is not set");
  return key;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normalize(item: any, type: "movie" | "show"): MetadataSearchResult {
  const genres = ((item.genre_ids ?? []) as number[])
    .map((id) => TMDB_GENRES[id])
    .filter(Boolean)
    .slice(0, 4);

  if (type === "movie") {
    return {
      external_id: String(item.id),
      external_source: "tmdb",
      title: item.title ?? item.original_title ?? "",
      creator: item.director ?? "",
      release_date: item.release_date ?? null,
      description: item.overview ?? "",
      cover_url: item.poster_path ? `${IMG}${item.poster_path}` : "",
      metadata: {
        runtime_minutes: item.runtime ?? undefined,
        genres,
        tmdb_url: `https://www.themoviedb.org/movie/${item.id}`,
      },
    };
  }
  return {
    external_id: String(item.id),
    external_source: "tmdb",
    title: item.name ?? item.original_name ?? "",
    creator: item.created_by?.[0]?.name ?? "",
    release_date: item.first_air_date ?? null,
    description: item.overview ?? "",
    cover_url: item.poster_path ? `${IMG}${item.poster_path}` : "",
    metadata: {
      episode_count: item.number_of_episodes ?? undefined,
      season_count: item.number_of_seasons ?? undefined,
      network: item.networks?.[0]?.name ?? undefined,
      genres,
      tmdb_url: `https://www.themoviedb.org/tv/${item.id}`,
    },
  };
}

async function fetchTvDetail(
  id: number,
): Promise<{ last_air_date?: string; in_production?: boolean } | null> {
  try {
    const url = `${BASE}/tv/${id}?api_key=${apiKey()}`;
    const res = await fetch(url, { next: { revalidate: 3600 } });
    if (!res.ok) return null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const d: any = await res.json();
    return {
      last_air_date: d.last_air_date ?? undefined,
      in_production: d.in_production ?? undefined,
    };
  } catch {
    return null;
  }
}

export async function searchTmdb(
  query: string,
  type: "movie" | "show",
): Promise<MetadataSearchResult[]> {
  const endpoint = type === "movie" ? "search/movie" : "search/tv";
  const url = `${BASE}/${endpoint}?api_key=${apiKey()}&query=${encodeURIComponent(query)}&page=1`;
  const res = await fetch(url, { next: { revalidate: 0 } });
  if (!res.ok) throw new Error(`TMDB ${res.status}: ${await res.text()}`);
  const data = await res.json();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const results: any[] = (data.results ?? []).slice(0, 8);

  if (type === "show") {
    const details = await Promise.all(results.map((r) => fetchTvDetail(r.id as number)));
    return results.map((item, i) => {
      const base = normalize(item, "show");
      const detail = details[i];
      if (detail) {
        (base.metadata as Record<string, unknown>).last_air_date = detail.last_air_date;
        (base.metadata as Record<string, unknown>).in_production = detail.in_production;
      }
      return base;
    });
  }

  return results.map((item) => normalize(item, type));
}

export interface ImdbMatch {
  media_type: "movie" | "show";
  result: MetadataSearchResult;
}

/**
 * Resolve an IMDb const ("tt0111161") straight to TMDB. Exact by construction — the
 * bulk import path uses this instead of `searchTmdb` so there is no title matching to
 * get wrong. Returns null when TMDB has no record of the id.
 */
export async function findByImdbId(imdbId: string): Promise<ImdbMatch | null> {
  const url = `${BASE}/find/${encodeURIComponent(imdbId)}?api_key=${apiKey()}&external_source=imdb_id`;
  const res = await fetch(url, { next: { revalidate: 3600 } });
  if (!res.ok) throw new Error(`TMDB ${res.status}: ${await res.text()}`);
  const data = await res.json();

  const movie = (data.movie_results ?? [])[0];
  if (movie) return { media_type: "movie", result: normalize(movie, "movie") };

  const tv = (data.tv_results ?? [])[0];
  if (tv) {
    const base = normalize(tv, "show");
    // Same enrichment searchTmdb does, so an imported show carries the same fields as a
    // searched one.
    const detail = await fetchTvDetail(tv.id as number);
    if (detail) {
      (base.metadata as Record<string, unknown>).last_air_date = detail.last_air_date;
      (base.metadata as Record<string, unknown>).in_production = detail.in_production;
    }
    return { media_type: "show", result: base };
  }

  return null;
}

/** Resolve many IMDb consts, capping in-flight requests so TMDB does not rate-limit us. */
export async function findByImdbIds(
  imdbIds: string[],
  concurrency = 6,
): Promise<Map<string, ImdbMatch | null>> {
  const out = new Map<string, ImdbMatch | null>();
  let cursor = 0;

  const worker = async () => {
    while (cursor < imdbIds.length) {
      const id = imdbIds[cursor++];
      try {
        out.set(id, await findByImdbId(id));
      } catch {
        // A single lookup failure is an unmatched row, not a failed import.
        out.set(id, null);
      }
    }
  };

  await Promise.all(Array.from({ length: Math.min(concurrency, imdbIds.length) }, worker));
  return out;
}
