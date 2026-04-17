"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { AlertTriangle, LineChart as LineChartIcon } from "lucide-react";
import EmptyState from "./empty-state";
import type { StocksCache } from "@/lib/types";

function Sparkline({ points }: { points: { close: number }[] }) {
  if (points.length < 2) return null;
  const values = points.map((p) => p.close);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const w = 100;
  const h = 20;
  const padX = 2;
  const padY = 2;
  const innerW = w - padX * 2;
  const innerH = h - padY * 2;
  const d = values
    .map((v, i) => {
      const x = padX + (innerW * i) / (values.length - 1);
      const y = padY + innerH - ((v - min) / span) * innerH;
      return `${i === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");
  return (
    <svg
      width="100%"
      height="100%"
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="none"
      style={{ display: "block" }}
      aria-hidden="true"
    >
      <path
        d={d}
        fill="none"
        stroke="var(--color-text)"
        strokeWidth={1.5}
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

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
  const marketOpen = isWeekday && minutesSinceMidnight >= 570 && minutesSinceMidnight < 960;
  return ageMs > (marketOpen ? 60 * 60 * 1000 : 12 * 60 * 60 * 1000);
}

function formatPrice(price: number | null): string {
  if (price == null) return "—";
  return `$${price.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatChange(changeAbs: number | null, changePct: number | null): string {
  if (changeAbs == null || changePct == null) return "—";
  const sign = changeAbs >= 0 ? "+" : "";
  return `${sign}${changeAbs.toFixed(2)} (${sign}${changePct.toFixed(2)}%)`;
}

function TickerRow({ row }: { row: StocksCache }) {
  const isPositive = (row.change_abs ?? 0) >= 0;
  const changeColor = isPositive ? "var(--color-positive)" : "var(--color-danger)";
  const sparkData = (row.sparkline ?? []).map((p) => ({ close: p.close }));

  return (
    <li
      className="db-row"
      style={{
        gridTemplateColumns: "auto 1fr auto",
        fontSize: "var(--t-meta)",
      }}
    >
      <span
        className="font-heading"
        style={{
          fontWeight: 500,
          color: "var(--color-text)",
          letterSpacing: "0.02em",
          minWidth: "3.5rem",
        }}
      >
        {row.ticker}
      </span>
      <span className="watchlist-spark" style={{ height: 20, minWidth: 60, display: "flex", alignItems: "center" }}>
        <Sparkline points={sparkData} />
      </span>
      <span className="tnum" style={{ textAlign: "right", minWidth: 110 }}>
        <span style={{ color: "var(--color-text)", marginRight: "var(--space-2)" }}>
          {formatPrice(row.price)}
        </span>
        <span style={{ color: changeColor, fontSize: "var(--t-micro)" }}>
          {formatChange(row.change_abs, row.change_pct)}
        </span>
      </span>
    </li>
  );
}

export function WatchlistWidget({ rows, hasApiKey, refreshAction }: Props) {
  const [isPending, startTransition] = useTransition();
  const [rateLimited, setRateLimited] = useState(false);
  const autoRanRef = useRef(false);

  useEffect(() => {
    if (autoRanRef.current || !hasApiKey || rows.length === 0) return;
    autoRanRef.current = true;
    const latest = rows.reduce<string | null>(
      (acc, r) => (acc == null || r.fetched_at > acc ? r.fetched_at : acc),
      null,
    );
    if (isStocksStale(latest)) {
      startTransition(async () => {
        const result = await refreshAction();
        if (result.rateLimited) setRateLimited(true);
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <section>
      <style>{`
        @media (max-width: 480px) { .watchlist-spark { display: none; } }
      `}</style>
      <h2 className="db-section-label">Watchlist</h2>

      {!hasApiKey ? (
        <p style={{ fontSize: "var(--t-meta)", color: "var(--color-text-faint)" }}>
          Add{" "}
          <code
            style={{
              fontSize: "var(--t-micro)",
              color: "var(--accent)",
              background: "var(--color-cta-subtle)",
              padding: "1px 5px",
              borderRadius: "var(--r-1)",
            }}
          >
            POLYGON_API_KEY
          </code>{" "}
          to enable stock data.
        </p>
      ) : rows.length === 0 ? (
        <EmptyState icon={LineChartIcon} actionHref="/settings#watchlist" actionLabel="Add">
          No stocks on watchlist
        </EmptyState>
      ) : (
        <>
          {rateLimited && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "var(--space-2)",
                fontSize: "var(--t-micro)",
                color: "var(--accent)",
                marginBottom: "var(--space-2)",
              }}
            >
              <AlertTriangle size={12} />
              Rate-limited — showing cached data.
            </div>
          )}
          <ul
            style={{
              listStyle: "none",
              margin: 0,
              padding: 0,
              opacity: isPending ? 0.5 : 1,
              transition: "opacity var(--motion-fast) var(--ease-out-quart)",
            }}
          >
            {rows.map((row) => (
              <TickerRow key={row.ticker} row={row} />
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
