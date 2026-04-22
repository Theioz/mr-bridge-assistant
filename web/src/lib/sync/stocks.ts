import type { SupabaseClient } from "@supabase/supabase-js";
import { todayString, daysAgoString, USER_TZ } from "@/lib/timezone";

const POLYGON_BASE = "https://api.polygon.io";

export interface StocksSyncResult {
  updated: number;
  tickers: string[];
  rateLimited?: boolean;
}

interface PolygonBar {
  o: number; // open
  c: number; // close
  t: number; // timestamp ms
}

class RateLimitError extends Error {
  constructor() {
    super("Polygon rate limit");
    this.name = "RateLimitError";
  }
}

async function polygonGet(path: string, apiKey: string): Promise<Record<string, unknown> | null> {
  const sep = path.includes("?") ? "&" : "?";
  const url = `${POLYGON_BASE}${path}${sep}apiKey=${apiKey}`;
  const res = await fetch(url, { cache: "no-store" });
  if (res.status === 429) {
    console.error(`[stocks] Polygon ${path} returned 429 (rate limit)`);
    throw new RateLimitError();
  }
  if (!res.ok) {
    console.error(`[stocks] Polygon ${path} returned ${res.status}`);
    return null;
  }
  return res.json();
}

export async function syncStocks(
  db: SupabaseClient,
  userId: string,
  tickers: string[],
): Promise<StocksSyncResult> {
  const apiKey = process.env.POLYGON_API_KEY;
  if (!apiKey) throw new Error("POLYGON_API_KEY not configured");

  // Sparkline range: 45 calendar days back to guarantee ≥30 trading days
  const from = daysAgoString(45);
  const to = todayString();

  let rateLimited = false;
  const rows = await Promise.all(
    tickers.map(async (ticker) => {
      try {
        const [prevData, rangeData] = await Promise.all([
          polygonGet(`/v2/aggs/ticker/${ticker}/prev`, apiKey),
          polygonGet(`/v2/aggs/ticker/${ticker}/range/1/day/${from}/${to}`, apiKey),
        ]);

        const prevBar = (prevData?.results as PolygonBar[] | undefined)?.[0] ?? null;
        const price = prevBar?.c ?? null;
        const changeAbs = prevBar != null ? prevBar.c - prevBar.o : null;
        const changePct =
          prevBar != null && prevBar.o !== 0 ? ((prevBar.c - prevBar.o) / prevBar.o) * 100 : null;

        const rangeBars = (rangeData?.results as PolygonBar[] | undefined) ?? [];
        // Keep last 30 trading days (~6 weeks of context)
        const sparkline = rangeBars.slice(-30).map((bar) => ({
          date: new Intl.DateTimeFormat("en-CA", { timeZone: USER_TZ }).format(new Date(bar.t)),
          close: bar.c,
        }));

        return {
          user_id: userId,
          ticker,
          price,
          change_abs: changeAbs,
          change_pct: changePct,
          sparkline: sparkline.length > 0 ? sparkline : null,
          fetched_at: new Date().toISOString(),
        };
      } catch (e) {
        if (e instanceof RateLimitError) {
          rateLimited = true;
          return null;
        }
        throw e;
      }
    }),
  );

  const validRows = rows.filter((r): r is NonNullable<typeof r> => r !== null);
  if (validRows.length > 0) {
    const { error } = await db
      .from("stocks_cache")
      .upsert(validRows, { onConflict: "user_id,ticker" });
    if (error) throw new Error(error.message);
  }

  return { updated: validRows.length, tickers, rateLimited };
}
