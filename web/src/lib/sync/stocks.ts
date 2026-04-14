import type { SupabaseClient } from "@supabase/supabase-js";

const POLYGON_BASE = "https://api.polygon.io";

export interface StocksSyncResult {
  updated: number;
  tickers: string[];
}

interface PolygonBar {
  o: number; // open
  c: number; // close
  t: number; // timestamp ms
}

async function polygonGet(path: string, apiKey: string): Promise<Record<string, unknown> | null> {
  const sep = path.includes("?") ? "&" : "?";
  const url = `${POLYGON_BASE}${path}${sep}apiKey=${apiKey}`;
  const res = await fetch(url, { cache: "no-store" });
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

  // Sparkline range: 14 calendar days back to guarantee ≥7 trading days
  const now = new Date();
  const fromDate = new Date(now);
  fromDate.setDate(fromDate.getDate() - 14);
  const from = fromDate.toISOString().slice(0, 10);
  const to = now.toISOString().slice(0, 10);

  const rows = await Promise.all(
    tickers.map(async (ticker) => {
      const [prevData, rangeData] = await Promise.all([
        polygonGet(`/v2/aggs/ticker/${ticker}/prev`, apiKey),
        polygonGet(`/v2/aggs/ticker/${ticker}/range/1/day/${from}/${to}`, apiKey),
      ]);

      const prevBar = (prevData?.results as PolygonBar[] | undefined)?.[0] ?? null;
      const price = prevBar?.c ?? null;
      const changeAbs = prevBar != null ? prevBar.c - prevBar.o : null;
      const changePct = prevBar != null && prevBar.o !== 0
        ? ((prevBar.c - prevBar.o) / prevBar.o) * 100
        : null;

      const rangeBars = (rangeData?.results as PolygonBar[] | undefined) ?? [];
      // Keep last 7 trading days
      const sparkline = rangeBars.slice(-7).map((bar) => ({
        date: new Date(bar.t).toISOString().slice(0, 10),
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
    }),
  );

  const { error } = await db
    .from("stocks_cache")
    .upsert(rows, { onConflict: "user_id,ticker" });

  if (error) throw new Error(error.message);

  return { updated: rows.length, tickers };
}
