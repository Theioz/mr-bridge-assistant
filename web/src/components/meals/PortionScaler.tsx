"use client";

import { useState } from "react";

/**
 * "Makes [N] portions" — a display-only override of a recipe's `typical_portions`.
 *
 * Mr. Bridge sets `typical_portions` when it writes the recipe; this box lets Jason see the same
 * recipe at another batch size without editing it. Nothing is saved: the stored recipe, its
 * per-serving macros and the grocery list all keep reading `typical_portions`. A cook records what
 * was actually made, through CookItDialog's own portions field.
 *
 * The input keeps its own text so the field can be cleared mid-edit; only a whole number from 1 to
 * MAX_PORTIONS reaches `onChange`.
 */
const MAX_PORTIONS = 24;

/** A recipe's batch size, treating a missing or non-positive `typical_portions` as one serving. */
export function batchOf(typicalPortions: number | null | undefined): number {
  return typicalPortions && typicalPortions > 0 ? typicalPortions : 1;
}

export function PortionScaler({
  base,
  value,
  onChange,
}: {
  base: number;
  value: number;
  onChange: (portions: number) => void;
}) {
  const [text, setText] = useState(String(value));
  const scaled = value !== base;

  function commit(raw: string) {
    setText(raw);
    const n = Math.round(Number(raw));
    if (raw.trim() !== "" && Number.isFinite(n) && n >= 1 && n <= MAX_PORTIONS) onChange(n);
  }

  function reset() {
    setText(String(base));
    onChange(base);
  }

  return (
    <div style={wrapStyle}>
      <label style={labelStyle}>
        <span>Makes</span>
        <input
          type="number"
          inputMode="numeric"
          min={1}
          max={MAX_PORTIONS}
          step={1}
          value={text}
          onChange={(e) => commit(e.target.value)}
          onBlur={() => setText(String(value))}
          aria-label="Portions"
          style={inputStyle}
        />
        <span>portion{value === 1 ? "" : "s"}</span>
      </label>
      {scaled && (
        <span style={noteStyle}>
          Scaled from {base}.{" "}
          <button type="button" onClick={reset} style={resetStyle}>
            Reset
          </button>
        </span>
      )}
    </div>
  );
}

const wrapStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  flexWrap: "wrap",
  gap: "var(--space-3)",
  marginBottom: "var(--space-2)",
};

const labelStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "var(--space-2)",
  fontSize: "var(--t-meta)",
  color: "var(--color-text)",
};

const inputStyle: React.CSSProperties = {
  width: 64,
  padding: "var(--space-1) var(--space-2)",
  // 16px minimum, or iOS zooms the whole page on focus (#688).
  fontSize: "16px",
  background: "var(--color-bg)",
  color: "var(--color-text)",
  border: "1px solid var(--color-border)",
  borderRadius: "var(--r-1)",
  fontVariantNumeric: "tabular-nums",
};

const noteStyle: React.CSSProperties = {
  fontSize: "var(--t-micro)",
  color: "var(--color-text-muted)",
};

const resetStyle: React.CSSProperties = {
  fontSize: "var(--t-micro)",
  color: "var(--color-text-muted)",
  background: "transparent",
  border: "none",
  padding: 0,
  textDecoration: "underline",
  cursor: "pointer",
};
