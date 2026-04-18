import { tool, jsonSchema } from "ai";
import type { ToolContext } from "./_context";

export function buildStocksTools({ supabase, userId }: ToolContext) {
  return {
    get_stock_quote: tool({
      description: "Get current price and daily change for a stock ticker. Checks stocks_cache first; falls back to a live Polygon.io fetch if the cache is stale (>6h) or the ticker is not cached. Use when the user asks about a stock price or market move.",
      inputSchema: jsonSchema<{ ticker: string }>({
        type: "object",
        required: ["ticker"],
        properties: {
          ticker: { type: "string", description: "Stock ticker symbol, e.g. AAPL, NVDA, BTC-USD" },
        },
      }),
      execute: async ({ ticker }) => {
        const sym = ticker.toUpperCase();

        // 1. Check stocks_cache
        const { data: cached } = await supabase
          .from("stocks_cache")
          .select("ticker,price,change_abs,change_pct,fetched_at")
          .eq("user_id", userId)
          .eq("ticker", sym)
          .maybeSingle();

        const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString();
        if (cached && cached.fetched_at > sixHoursAgo) {
          return {
            ticker: cached.ticker,
            price: cached.price,
            change_abs: cached.change_abs,
            change_pct: cached.change_pct,
            fetched_at: cached.fetched_at,
            source: "cache",
          };
        }

        // 2. Live fetch from Polygon
        const apiKey = process.env.POLYGON_API_KEY;
        if (!apiKey) return { error: "POLYGON_API_KEY not configured" };

        const res = await fetch(
          `https://api.polygon.io/v2/aggs/ticker/${sym}/prev?apiKey=${apiKey}`,
          { cache: "no-store" },
        );
        if (!res.ok) return { error: `Polygon returned ${res.status}` };

        const json = await res.json() as { results?: { o: number; c: number }[] };
        const bar = json.results?.[0];
        if (!bar) return { error: "No data returned for this ticker" };

        const price = bar.c;
        const changeAbs = bar.c - bar.o;
        const changePct = bar.o !== 0 ? ((bar.c - bar.o) / bar.o) * 100 : 0;

        return {
          ticker: sym,
          price,
          change_abs: changeAbs,
          change_pct: changePct,
          fetched_at: new Date().toISOString(),
          source: "live",
        };
      },
    }),
  };
}
