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
  const [validating, setValidating] = useState(false);

  async function handleAdd() {
    const symbol = input.trim().toUpperCase();
    if (!symbol) return;
    if (tickers.includes(symbol)) {
      setError(`${symbol} is already in your watchlist`);
      return;
    }

    setError(null);
    setValidating(true);

    let valid = true;
    try {
      const res = await fetch(`/api/stocks/validate?ticker=${encodeURIComponent(symbol)}`);
      const json = (await res.json()) as { valid: boolean };
      valid = json.valid;
    } catch {
      // Network error — allow add
    } finally {
      setValidating(false);
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

  const addBusy = validating || isPending;

  return (
    <section
      style={{
        paddingTop: "var(--space-6)",
        paddingBottom: "var(--space-6)",
        borderBottom: "1px solid var(--rule-soft)",
      }}
    >
      <h2 className="db-section-label">Stock Watchlist</h2>

      {!hasApiKey && (
        <p
          style={{
            fontSize: "var(--t-micro)",
            color: "var(--color-text-muted)",
            marginBottom: "var(--space-3)",
          }}
        >
          <code
            style={{
              fontSize: "var(--t-micro)",
              color: "var(--accent-text)",
              background: "var(--accent-soft)",
              padding: "1px 5px",
              borderRadius: "var(--r-1)",
            }}
          >
            POLYGON_API_KEY
          </code>{" "}
          not configured — tickers will be saved but data won&apos;t load until the key is set.
        </p>
      )}

      {/* Add input — inline, hairline bottom rule, amber + button */}
      <div
        style={{
          borderBottom: "1px solid var(--rule)",
          paddingTop: "var(--space-2)",
          paddingBottom: "var(--space-3)",
        }}
      >
        <div className="flex items-center" style={{ gap: "var(--space-3)" }}>
          <Plus size={16} style={{ color: "var(--accent)", flexShrink: 0 }} aria-hidden />
          <input
            value={input}
            onChange={(e) => {
              setInput(e.target.value.toUpperCase());
              setError(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleAdd();
            }}
            placeholder="Add a ticker (e.g. AAPL)"
            maxLength={12}
            className="flex-1 bg-transparent focus:outline-none min-w-0"
            style={{
              color: "var(--color-text)",
              fontSize: "var(--t-body)",
              fontFamily: "monospace",
              letterSpacing: "0.05em",
              caretColor: "var(--accent)",
              minHeight: 44,
              border: "none",
            }}
          />
          <button
            onClick={handleAdd}
            disabled={addBusy || !input.trim()}
            className="flex items-center justify-center flex-shrink-0 cursor-pointer disabled:opacity-30 disabled:cursor-default"
            style={{
              gap: "var(--space-1)",
              padding: "0 var(--space-3)",
              minHeight: 44,
              minWidth: 72,
              background: "var(--accent)",
              color: "var(--color-text-on-cta)",
              border: "1px solid var(--accent)",
              borderRadius: "var(--r-1)",
              fontSize: "var(--t-micro)",
              fontWeight: 500,
              letterSpacing: "0.02em",
              transition: "opacity var(--motion-fast) var(--ease-out-quart)",
            }}
          >
            {addBusy ? <Loader2 size={14} className="animate-spin" /> : "Add"}
          </button>
        </div>
        {error && (
          <p
            style={{
              fontSize: "var(--t-micro)",
              color: "var(--color-danger)",
              marginTop: "var(--space-2)",
            }}
          >
            {error}
          </p>
        )}
      </div>

      {/* Ticker list — hairline-separated rows */}
      {tickers.length === 0 ? (
        <p
          style={{
            fontSize: "var(--t-micro)",
            color: "var(--color-text-faint)",
            paddingTop: "var(--space-4)",
          }}
        >
          No tickers added yet.
        </p>
      ) : (
        <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
          {tickers.map((ticker, i) => (
            <li
              key={ticker}
              className="flex items-center justify-between"
              style={{
                paddingTop: "var(--space-3)",
                paddingBottom: "var(--space-3)",
                gap: "var(--space-3)",
                borderTop: i === 0 ? "none" : "1px solid var(--rule-soft)",
                minHeight: 44,
              }}
            >
              <span
                style={{
                  fontSize: "var(--t-meta)",
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
                className="flex items-center justify-center cursor-pointer disabled:opacity-40 hover-text-danger"
                style={{
                  width: 44,
                  height: 44,
                  color: "var(--color-text-faint)",
                  background: "transparent",
                  border: "none",
                  borderRadius: "var(--r-1)",
                  transition: "color var(--motion-fast) var(--ease-out-quart)",
                }}
                title={`Remove ${ticker}`}
              >
                <X size={14} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
