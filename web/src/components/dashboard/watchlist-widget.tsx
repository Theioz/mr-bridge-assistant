"use client";

import { useTransition } from "react";
import { LineChart, Line, ResponsiveContainer } from "recharts";
import { RefreshCw, Loader2 } from "lucide-react";
import type { StocksCache } from "@/lib/types";

interface Props {
  rows: StocksCache[];
  hasApiKey: boolean;
  refreshAction: () => Promise<void>;
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
  const changeColor = isPositive ? "#22c55e" : "#ef4444";

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

  function handleRefresh() {
    startTransition(async () => {
      await refreshAction();
    });
  }

  return (
    <>
      {/* Hide sparkline column on small screens */}
      <style>{`
        @media (max-width: 480px) {
          .watchlist-spark { display: none; }
        }
      `}</style>

      <div
        className="rounded-xl overflow-hidden"
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
                background: "rgba(245,158,11,0.08)",
                padding: "1px 5px",
                borderRadius: 4,
              }}
            >
              POLYGON_API_KEY
            </code>{" "}
            to your environment to enable stock data.
          </div>
        )}

        {/* Empty watchlist */}
        {hasApiKey && rows.length === 0 && (
          <div
            className="px-5 py-6 text-center"
            style={{ fontSize: 13, color: "var(--color-text-faint)" }}
          >
            No stocks — add tickers in Settings
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
