"use client";

import { useState, useTransition } from "react";
import { Plus, X, Loader2 } from "lucide-react";

interface Props {
  watchlist: string[];
  saveAction: (tickers: string[]) => Promise<void>;
  hasApiKey: boolean;
}

export function WatchlistSettings({ watchlist, saveAction, hasApiKey }: Props) {
  const [tickers, setTickers] = useState<string[]>(watchlist);
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  async function handleAdd() {
    const symbol = input.trim().toUpperCase();
    if (!symbol) return;
    if (tickers.includes(symbol)) {
      setError(`${symbol} is already in your watchlist`);
      return;
    }

    setError(null);

    // Validate via proxy route (keeps POLYGON_API_KEY server-side)
    let valid = true;
    try {
      const res = await fetch(`/api/stocks/validate?ticker=${encodeURIComponent(symbol)}`);
      const json = await res.json() as { valid: boolean };
      valid = json.valid;
    } catch {
      // Network error — allow add
    }

    if (!valid) {
      setError(`Ticker "${symbol}" not found`);
      return;
    }

    const next = [...tickers, symbol];
    setTickers(next);
    setInput("");
    startTransition(async () => {
      await saveAction(next);
    });
  }

  function handleRemove(ticker: string) {
    const next = tickers.filter((t) => t !== ticker);
    setTickers(next);
    startTransition(async () => {
      await saveAction(next);
    });
  }

  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)" }}
    >
      {/* Header */}
      <div className="px-5 py-4" style={{ borderBottom: "1px solid var(--color-border)" }}>
        <p
          className="text-xs uppercase tracking-widest"
          style={{ color: "var(--color-text-muted)", letterSpacing: "0.07em" }}
        >
          Stock Watchlist
        </p>
      </div>

      {/* No-key warning */}
      {!hasApiKey && (
        <div
          className="px-5 py-2.5"
          style={{
            fontSize: 12,
            color: "var(--color-text-muted)",
            background: "var(--warning-subtle)",
            borderBottom: "1px solid var(--warning-subtle-strong)",
          }}
        >
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
          not configured — tickers will be saved but data won&apos;t load until the key is set.
        </div>
      )}

      {/* Add input */}
      <div className="px-5 py-4" style={{ borderBottom: "1px solid var(--color-border)" }}>
        <div className="flex gap-2">
          <input
            value={input}
            onChange={(e) => {
              setInput(e.target.value.toUpperCase());
              setError(null);
            }}
            onKeyDown={(e) => { if (e.key === "Enter") handleAdd(); }}
            placeholder="e.g. AAPL"
            maxLength={12}
            className="flex-1 rounded-lg px-3 py-2 text-sm transition-colors duration-150 focus:outline-none input-focus-ring"
            style={{
              background: "var(--color-surface-raised)",
              border: `1px solid ${error ? "var(--color-danger)" : "var(--color-border)"}`,
              color: "var(--color-text)",
              fontFamily: "monospace",
              letterSpacing: "0.05em",
            }}
          />
          <button
            onClick={handleAdd}
            disabled={isPending || !input.trim()}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-150 cursor-pointer disabled:opacity-40 disabled:cursor-default"
            style={{
              background: "var(--color-primary)",
              color: "var(--color-text-on-cta)",
              border: "1px solid var(--color-primary)",
              minWidth: 72,
            }}
          >
            {isPending ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <><Plus size={14} /> Add</>
            )}
          </button>
        </div>
        {error && (
          <p className="mt-1.5" style={{ fontSize: 12, color: "var(--color-danger)" }}>
            {error}
          </p>
        )}
      </div>

      {/* Ticker list */}
      {tickers.length === 0 ? (
        <div className="px-5 py-4" style={{ fontSize: 13, color: "var(--color-text-faint)" }}>
          No tickers added yet.
        </div>
      ) : (
        tickers.map((ticker) => (
          <div
            key={ticker}
            className="flex items-center justify-between px-5 py-3"
            style={{ borderBottom: "1px solid var(--color-border)" }}
          >
            <span
              style={{
                fontSize: 13,
                fontWeight: 500,
                color: "var(--color-text)",
                fontFamily: "monospace",
                letterSpacing: "0.04em",
              }}
            >
              {ticker}
            </span>
            <button
              onClick={() => handleRemove(ticker)}
              disabled={isPending}
              className="flex items-center justify-center w-6 h-6 rounded transition-colors cursor-pointer disabled:opacity-40 hover-text-danger"
              style={{ color: "var(--color-text-faint)" }}
              title={`Remove ${ticker}`}
            >
              <X size={13} />
            </button>
          </div>
        ))
      )}
    </div>
  );
}
