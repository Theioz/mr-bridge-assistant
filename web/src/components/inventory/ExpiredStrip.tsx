"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  STILL_GOOD_DAYS,
  daysUntil,
  expiredItems,
  stillGoodUntil,
  type FreshnessInput,
} from "@/lib/nutrition/inventory-freshness";

/**
 * Food past its date: toss it or keep it.
 *
 * These rows used to sit at the head of "Cook these first" (#761) — the one list whose
 * instruction is wrong for food that may be off. The decision actually owed is binary, so the
 * strip offers exactly the two answers:
 *
 *   - Tossed      → DELETE /api/inventory/[id], the same path as the list's Remove.
 *   - Still good  → PATCH  /api/inventory/[id] { expires_on: today + STILL_GOOD_DAYS }, the same
 *                   path as the list's Edit. Counted from today, so a long-expired item lands
 *                   back in "use soon" rather than straight back here.
 *
 * Both write through the existing inventory API and then refresh the server component; there is
 * no local copy to drift.
 */

interface ExpiredItem extends FreshnessInput {
  id: string;
  name: string;
}

export function ExpiredStrip({ items }: { items: ExpiredItem[] }) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const expired = expiredItems(items);
  if (expired.length === 0) return null;

  async function act(id: string, method: "DELETE" | "PATCH", body?: unknown) {
    setBusyId(id);
    setError(null);
    try {
      const res = await fetch(`/api/inventory/${id}`, {
        method,
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      if (!res.ok) {
        setError((await res.json().catch(() => ({}))).error ?? "Couldn't update that");
        return;
      }
      router.refresh();
    } catch {
      setError("Couldn't update that");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section aria-label="Expired items" style={boxStyle}>
      <p style={headerStyle}>Expired — toss or keep? · {expired.length}</p>
      {error && (
        <p role="alert" style={{ ...metaStyle, color: "var(--color-danger)", margin: "0 0 4px" }}>
          {error}
        </p>
      )}
      {expired.map((item) => {
        const ago = -daysUntil(item.expires_on as string);
        const busy = busyId === item.id;
        return (
          <div key={item.id} style={rowStyle}>
            <span style={nameStyle}>{item.name}</span>
            <span style={metaStyle}>{ago === 1 ? "1 day ago" : `${ago} days ago`}</span>
            <button
              type="button"
              disabled={busy}
              onClick={() => act(item.id, "DELETE")}
              style={buttonStyle(busy)}
              aria-label={`Tossed ${item.name} — remove it`}
            >
              Tossed
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => act(item.id, "PATCH", { expires_on: stillGoodUntil() })}
              style={buttonStyle(busy)}
              aria-label={`${item.name} is still good — keep it ${STILL_GOOD_DAYS} more days`}
              title={`Keep it: good for ${STILL_GOOD_DAYS} more days`}
            >
              Still good
            </button>
          </div>
        );
      })}
    </section>
  );
}

const boxStyle: React.CSSProperties = {
  border: "1px solid var(--rule-soft)",
  borderRadius: "var(--r-2)",
  padding: "var(--space-2) var(--space-3)",
  marginBottom: "var(--space-4)",
};

const headerStyle: React.CSSProperties = {
  fontSize: "var(--t-micro)",
  fontWeight: 600,
  color: "var(--color-danger)",
  textTransform: "uppercase",
  letterSpacing: "0.04em",
  margin: "0 0 var(--space-1)",
};

const rowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  flexWrap: "wrap",
  gap: "var(--space-2)",
  padding: "var(--space-1) 0",
};

const nameStyle: React.CSSProperties = {
  flex: "1 1 8rem",
  minWidth: 0,
  fontSize: "var(--t-meta)",
  color: "var(--color-text)",
  overflowWrap: "anywhere",
};

const metaStyle: React.CSSProperties = {
  fontSize: "var(--t-micro)",
  color: "var(--color-text-muted)",
  fontVariantNumeric: "tabular-nums",
};

function buttonStyle(busy: boolean): React.CSSProperties {
  return {
    fontFamily: "var(--font-body), system-ui, sans-serif",
    fontSize: "var(--t-micro)",
    fontWeight: 500,
    color: "var(--color-text-muted)",
    background: "transparent",
    border: "1px solid var(--rule-soft)",
    borderRadius: "var(--r-1)",
    padding: "0 var(--space-3)",
    minHeight: 32,
    cursor: busy ? "wait" : "pointer",
    opacity: busy ? 0.5 : 1,
  };
}
