"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { LineChart, Line, ResponsiveContainer } from "recharts";
import { RefreshCw, Loader2, AlertTriangle, LineChart as LineChartIcon } from "lucide-react";
import EmptyState from "./empty-state";
import type { StocksCache } from "@/lib/types";

interface Props {
  rows: StocksCache[];
  hasApiKey: boolean;
  refreshAction: () => Promise<{ rateLimited: boolean }>;
}

// Stocks staleness: 1h during US market hours (M-F 9:30am-4pm ET), 12h otherwise
function isStocksStale(latest: string | null): boolean {
  if (!latest) return true;
  const ageMs = Date.now() - new Date(latest).getTime();
  const nyParts = new Date().toLocaleString("en-US", {
    timeZone: "America/New_York",
    weekday: "short", hour: "numeric", minute: "2-digit", hour12: false,
  });
  const isWeekday = !/^Sat|^Sun/.test(nyParts);
  const [, hh, mm] = nyParts.match(/(\d{1,2}):(\d{2})/) ?? [];
  const minutesSinceMidnight = (parseInt(hh ?? "0", 10) * 60) + parseInt(mm ?? "0", 10);
  const marketOpen = isWeekday && minutesSinceMidnight >= 570 && minutesSinceMidnight < 960; // 9:30–16:00
  return ageMs > (marketOpen ? 60 * 60 * 1000 : 12 * 60 * 60 * 1000);
}

function formatTime(isoString: string): string {
  return new Date(isoString).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function formatPrice(price: number | null): string {
  if (price == null) return "—";
  return `$${price.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatChange(changeAbs: number | null, changePct: number | null): string {
  if (changeAbs == null || changePct == null) return "—";
  const sign = changeAbs >= 0 ? "+" : "";
  const absStr = `${sign}${changeAbs.toFixed(2)}`;
  const pctStr = `(${sign}${changePct.toFixed(2)}%)`;
  return `${absStr} ${pctStr}`;
}

function TickerRow({ row }: { row: StocksCache }) {
  const isPositive = (row.change_abs ?? 0) >= 0;
  const changeColor = isPositive ? "var(--color-positive)" : "var(--color-danger)";

  const sparkData = (row.sparkline ?? []).map((p) => ({ close: p.close }));

  return (
    <div
      className="flex items-center gap-3 px-5 py-3"
      style={{ borderBottom: "1px solid var(--color-border)" }}
    >
      {/* Left: ticker + timestamp */}
      <div className="flex-1 min-w-0">
        <p
          className="font-heading font-semibold"
          style={{ fontSize: 14, color: "var(--color-text)", letterSpacing: "0.02em" }}
        >
          {row.ticker}
        </p>
        <p style={{ fontSize: 10, color: "var(--color-text-faint)", marginTop: 2 }}>
          Last updated {formatTime(row.fetched_at)}
        </p>
      </div>

      {/* Middle: sparkline — hidden below 480px via CSS */}
      <div className="watchlist-spark flex-shrink-0" style={{ width: 80, height: 32 }}>
        {sparkData.length > 1 ? (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={sparkData} margin={{ top: 2, right: 2, left: 2, bottom: 2 }}>
              <Line
                type="monotone"
                dataKey="close"
                stroke="var(--color-primary)"
                strokeWidth={1.5}
                dot={false}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div style={{ width: 80, height: 32 }} />
        )}
      </div>

      {/* Right: price + change */}
      <div className="flex-shrink-0 text-right" style={{ minWidth: 90 }}>
        <p
          className="font-heading font-semibold tabular-nums"
          style={{ fontSize: 14, color: "var(--color-text)" }}
        >
          {formatPrice(row.price)}
        </p>
        <p className="tabular-nums" style={{ fontSize: 11, color: changeColor, marginTop: 2 }}>
          {formatChange(row.change_abs, row.change_pct)}
        </p>
      </div>
    </div>
  );
}

export function WatchlistWidget({ rows, hasApiKey, refreshAction }: Props) {
  const [isPending, startTransition] = useTransition();
  const [rateLimited, setRateLimited] = useState(false);
  const autoRanRef = useRef(false);

  function handleRefresh() {
    setRateLimited(false);
    startTransition(async () => {
      const result = await refreshAction();
      if (result.rateLimited) setRateLimited(true);
    });
  }

  // Auto-refresh on mount if cache is stale (silent — no rate-limit banner)
  useEffect(() => {
    if (autoRanRef.current || !hasApiKey || rows.length === 0) return;
    autoRanRef.current = true;
    const latest = rows.reduce<string | null>(
      (acc, r) => (acc == null || r.fetched_at > acc ? r.fetched_at : acc),
      null,
    );
    if (isStocksStale(latest)) {
      startTransition(async () => { await refreshAction(); });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      {/* Hide sparkline column on small screens */}
      <style>{`
        @media (max-width: 480px) {
          .watchlist-spark { display: none; }
        }
      `}</style>

      <div
        className="rounded-xl overflow-hidden transition-all duration-200 card-lift"
        style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)" }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-3.5"
          style={{ borderBottom: "1px solid var(--color-border)" }}
        >
          <p
            className="text-xs uppercase tracking-widest"
            style={{ color: "var(--color-text-muted)", letterSpacing: "0.07em" }}
          >
            Watchlist
          </p>
          <button
            onClick={handleRefresh}
            disabled={isPending || !hasApiKey}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs transition-colors duration-150 cursor-pointer disabled:opacity-40 disabled:cursor-default"
            style={{
              background: "var(--color-surface-raised)",
              border: "1px solid var(--color-border)",
              color: isPending ? "var(--color-primary)" : "var(--color-text-muted)",
            }}
            onMouseOver={(e) => {
              if (!isPending && hasApiKey) e.currentTarget.style.color = "var(--color-text)";
            }}
            onMouseOut={(e) => {
              if (!isPending) e.currentTarget.style.color = "var(--color-text-muted)";
            }}
          >
            {isPending ? (
              <Loader2 size={11} className="animate-spin" />
            ) : (
              <RefreshCw size={11} />
            )}
            {isPending ? "Refreshing…" : "Refresh"}
          </button>
        </div>

        {/* No API key */}
        {!hasApiKey && (
          <div className="px-5 py-4" style={{ fontSize: 13, color: "var(--color-text-faint)" }}>
            Add{" "}
            <code
              style={{
                fontSize: 11,
                color: "var(--color-warning)",
                background: "var(--warning-subtle)",
                padding: "1px 5px",
                borderRadius: 4,
              }}
            >
              POLYGON_API_KEY
            </code>{" "}
            to your environment to enable stock data.
          </div>
        )}

        {/* Rate limit warning */}
        {rateLimited && (
          <div
            className="flex items-center gap-2 px-5 py-2.5"
            style={{
              fontSize: 12,
              color: "var(--color-warning)",
              background: "var(--warning-subtle)",
              borderBottom: "1px solid var(--warning-subtle-strong)",
            }}
          >
            <AlertTriangle size={12} />
            Polygon rate limit hit (5/min on free tier). Showing cached data — wait a minute and refresh.
          </div>
        )}

        {/* Empty watchlist */}
        {hasApiKey && rows.length === 0 && (
          <div className="px-5">
            <EmptyState
              icon={LineChartIcon}
              actionHref="/settings#watchlist"
              actionLabel="Add"
            >
              No stocks on watchlist
            </EmptyState>
          </div>
        )}

        {/* Ticker rows */}
        {hasApiKey && rows.length > 0 && (
          <div style={{ opacity: isPending ? 0.5 : 1, transition: "opacity 0.15s" }}>
            {rows.map((row) => (
              <TickerRow key={row.ticker} row={row} />
            ))}
          </div>
        )}
      </div>
    </>
  );
}
