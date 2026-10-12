/**
 * Open-Meteo place-name geocoding, shared by /api/weather's home location and travel mode.
 * Moved out of app/api/weather/route.ts unchanged (a route module may only export handlers).
 */
export interface GeoResult {
  lat: number;
  lon: number;
  /** "Melbourne, Victoria" — name plus admin1 (or country code). */
  label: string;
  /** The bare place name, "Melbourne". */
  name: string;
}

const COUNTRY_ALIASES: Record<string, string> = {
  usa: "united states",
  us: "united states",
  "u.s.a.": "united states",
  uk: "united kingdom",
};

/**
 * Geocode a place name. With `preferCountry`, the first result IN that country wins, and a query
 * with no result there returns null: "Melbourne" from an Australian address must not land in
 * Melbourne, Florida, and "Victoria" must not land in Canada.
 */
export async function geocode(
  query: string,
  preferCountry?: string | null,
): Promise<GeoResult | null> {
  const tryFetch = async (name: string) => {
    const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(name)}&count=${preferCountry ? 10 : 1}&language=en&format=json`;
    const res = await fetch(url, { next: { revalidate: 86400 } }); // cache 24h
    const data = await res.json();
    return data.results as
      | Array<{
          latitude: number;
          longitude: number;
          name: string;
          admin1?: string;
          country_code?: string;
          country?: string;
        }>
      | undefined;
  };

  let results = await tryFetch(query);
  if (!results?.length && query.includes(",")) {
    results = await tryFetch(query.split(",")[0].trim());
  }
  if (!results?.length) return null;

  let r = results[0];
  if (preferCountry) {
    const want = preferCountry.toLowerCase();
    const target = COUNTRY_ALIASES[want] ?? want;
    const hit = results.find(
      (x) => x.country?.toLowerCase() === target || x.country_code?.toLowerCase() === target,
    );
    if (!hit) return null;
    r = hit;
  }
  let label = r.name;
  if (r.admin1) label += `, ${r.admin1}`;
  else if (r.country_code) label += `, ${r.country_code}`;
  return { lat: r.latitude, lon: r.longitude, label, name: r.name };
}

/** The first candidate that geocodes, tried in order (see travel/stay.ts geocodeCandidates). */
export async function geocodeFirst(
  candidates: readonly string[],
  preferCountry?: string | null,
): Promise<GeoResult | null> {
  for (const c of candidates) {
    try {
      const hit = await geocode(c, preferCountry);
      if (hit) return hit;
    } catch {
      // A network blip on one candidate should not stop the next one being tried.
    }
  }
  return null;
}
