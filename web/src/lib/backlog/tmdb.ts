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

export async function searchTmdb(
  query: string,
  type: "movie" | "show",
): Promise<MetadataSearchResult[]> {
  const endpoint = type === "movie" ? "search/movie" : "search/tv";
  const url = `${BASE}/${endpoint}?api_key=${apiKey()}&query=${encodeURIComponent(query)}&page=1`;
  const res = await fetch(url, { next: { revalidate: 0 } });
  if (!res.ok) throw new Error(`TMDB ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return (data.results ?? []).slice(0, 8).map((item: unknown) => normalize(item, type));
}
