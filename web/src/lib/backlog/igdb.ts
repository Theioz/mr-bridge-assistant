import type { MetadataSearchResult } from "@/lib/types";

const TOKEN_URL = "https://id.twitch.tv/oauth2/token";
const API_URL = "https://api.igdb.com/v4";
const COVER_URL = "https://images.igdb.com/igdb/image/upload/t_cover_big";

let cachedToken: { value: string; expiresAt: number } | null = null;

async function getAccessToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAt - 60_000) {
    return cachedToken.value;
  }
  const clientId = process.env.IGDB_CLIENT_ID;
  const clientSecret = process.env.IGDB_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error("IGDB_CLIENT_ID / IGDB_CLIENT_SECRET not set");

  const res = await fetch(
    `${TOKEN_URL}?client_id=${clientId}&client_secret=${clientSecret}&grant_type=client_credentials`,
    { method: "POST" },
  );
  if (!res.ok) throw new Error(`IGDB token fetch ${res.status}: ${await res.text()}`);
  const data = await res.json();
  cachedToken = {
    value: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };
  return cachedToken.value;
}

export async function searchIgdb(query: string): Promise<MetadataSearchResult[]> {
  const clientId = process.env.IGDB_CLIENT_ID;
  if (!clientId) throw new Error("IGDB_CLIENT_ID is not set");

  const token = await getAccessToken();
  const body = `search "${query.replace(/"/g, "")}"; fields id,name,summary,cover.image_id,first_release_date,involved_companies.company.name,involved_companies.developer,platforms.name,genres.name; limit 8;`;

  const res = await fetch(`${API_URL}/games`, {
    method: "POST",
    headers: {
      "Client-ID": clientId,
      Authorization: `Bearer ${token}`,
      "Content-Type": "text/plain",
    },
    body,
    next: { revalidate: 0 },
  });
  if (!res.ok) throw new Error(`IGDB ${res.status}: ${await res.text()}`);
  const games = await res.json();

  return games.map(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (g: any): MetadataSearchResult => {
      const developer =
        (g.involved_companies ?? []).find((c: { developer: boolean }) => c.developer)?.company
          ?.name ?? "";
      const releaseDate = g.first_release_date
        ? new Date(g.first_release_date * 1000).toISOString().slice(0, 10)
        : null;
      const coverUrl = g.cover?.image_id ? `${COVER_URL}/${g.cover.image_id}.jpg` : "";
      const platform = (g.platforms ?? []).map((p: { name: string }) => p.name).join(", ");

      return {
        external_id: String(g.id),
        external_source: "igdb",
        title: g.name ?? "",
        creator: developer,
        release_date: releaseDate,
        description: g.summary ?? "",
        cover_url: coverUrl,
        metadata: {
          platform: platform || undefined,
          genre: (g.genres ?? [])[0]?.name ?? undefined,
          igdb_url: `https://www.igdb.com/games/${(g.name ?? "").toLowerCase().replace(/\s+/g, "-")}`,
        },
      };
    },
  );
}
