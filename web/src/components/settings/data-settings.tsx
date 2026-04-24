"use client";

import { useState } from "react";
import { Download, Loader2 } from "lucide-react";

type Format = "json" | "csv";
type Range = "all" | "1y" | "90d" | "30d";

const RANGE_OPTIONS: { value: Range; label: string }[] = [
  { value: "all", label: "All time" },
  { value: "1y", label: "Last year" },
  { value: "90d", label: "Last 90 days" },
  { value: "30d", label: "Last 30 days" },
];

export function DataSettings() {
  const [format, setFormat] = useState<Format>("json");
  const [range, setRange] = useState<Range>("all");
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleExport() {
    setStatus("loading");
    setErrorMessage(null);
    try {
      const res = await fetch("/api/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ format, range }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? `Export failed (HTTP ${res.status})`);
      }
      const blob = await res.blob();
      const disposition = res.headers.get("Content-Disposition") ?? "";
      const match = /filename="([^"]+)"/.exec(disposition);
      const filename = match?.[1] ?? `mr-bridge-export.${format === "json" ? "zip" : "zip"}`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setStatus("idle");
    } catch (err) {
      setStatus("error");
      setErrorMessage(err instanceof Error ? err.message : "Export failed");
    }
  }

  return (
    <section
      aria-labelledby="data-heading"
      style={{
        paddingTop: "var(--space-6)",
        paddingBottom: "var(--space-6)",
        borderBottom: "1px solid var(--rule-soft)",
      }}
    >
      <h2 id="data-heading" className="db-section-label">
        Export your data
      </h2>

      <p
        style={{
          fontSize: "var(--t-meta)",
          color: "var(--color-text-muted)",
          marginBottom: "var(--space-5)",
          maxWidth: "56ch",
        }}
      >
        Download a zip of everything you&rsquo;ve logged in Mr. Bridge &mdash; tasks, habits,
        fitness, recovery, meals, recipes, journal, workouts, and your profile. Choose JSON for a
        full-fidelity backup, or CSV to open in a spreadsheet.
      </p>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "var(--space-4)",
          marginBottom: "var(--space-5)",
        }}
      >
        <Toggle
          ariaLabel="Format"
          label="Format"
          options={[
            { value: "json", label: "JSON" },
            { value: "csv", label: "CSV" },
          ]}
          value={format}
          onChange={(v) => setFormat(v as Format)}
        />
        <Toggle
          ariaLabel="Date range"
          label="Date range"
          options={RANGE_OPTIONS}
          value={range}
          onChange={(v) => setRange(v as Range)}
        />
      </div>

      <button
        type="button"
        onClick={handleExport}
        disabled={status === "loading"}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "var(--space-2)",
          minHeight: 44,
          padding: "0 var(--space-5)",
          background: "var(--color-primary)",
          color: "var(--color-text-on-cta)",
          border: "none",
          borderRadius: "var(--r-1)",
          fontSize: "var(--t-meta)",
          fontWeight: 500,
          cursor: status === "loading" ? "wait" : "pointer",
          opacity: status === "loading" ? 0.7 : 1,
          transition: "opacity var(--motion-fast) var(--ease-out-quart)",
        }}
      >
        {status === "loading" ? (
          <>
            <Loader2 size={16} className="animate-spin" aria-hidden="true" />
            Preparing export&hellip;
          </>
        ) : (
          <>
            <Download size={16} aria-hidden="true" />
            Export my data
          </>
        )}
      </button>

      {status === "error" && errorMessage ? (
        <p
          role="alert"
          style={{
            marginTop: "var(--space-3)",
            fontSize: "var(--t-micro)",
            color: "var(--color-danger)",
          }}
        >
          {errorMessage}
        </p>
      ) : null}

      <div
        style={{
          marginTop: "var(--space-6)",
          paddingTop: "var(--space-4)",
          borderTop: "1px solid var(--rule-soft)",
          fontSize: "var(--t-micro)",
          color: "var(--color-text-muted)",
          lineHeight: 1.6,
        }}
      >
        <p style={{ marginBottom: "var(--space-2)" }}>
          <strong style={{ color: "var(--color-text)" }}>Included:</strong> tasks, habits, recipes,
          meals, fitness and recovery logs, workout plans and strength sessions, PRs, journal
          entries, study log, profile.
        </p>
        <p>
          <strong style={{ color: "var(--color-text)" }}>Not included:</strong> chat history,
          notifications, package tracking, equipment inventory, provider caches, and encrypted OAuth
          tokens.
        </p>
      </div>
    </section>
  );
}

function Toggle<T extends string>({
  label,
  ariaLabel,
  options,
  value,
  onChange,
}: {
  label: string;
  ariaLabel: string;
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "var(--space-4)", flexWrap: "wrap" }}>
      <span
        style={{
          fontSize: "var(--t-micro)",
          color: "var(--color-text-muted)",
          minWidth: 80,
          fontWeight: 500,
        }}
      >
        {label}
      </span>
      <div
        className="flex items-center p-0.5"
        style={{
          background: "transparent",
          border: "1px solid var(--rule)",
          borderRadius: "var(--r-1)",
          gap: 2,
        }}
        role="radiogroup"
        aria-label={ariaLabel}
      >
        {options.map((opt) => {
          const selected = opt.value === value;
          return (
            <button
              key={opt.value}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => onChange(opt.value)}
              style={{
                fontFamily: "var(--font-body), system-ui, sans-serif",
                fontSize: "var(--t-micro)",
                fontWeight: 500,
                letterSpacing: "0.02em",
                padding: "0 var(--space-3)",
                minHeight: 44,
                minWidth: 48,
                background: selected ? "var(--accent)" : "transparent",
                color: selected ? "var(--color-text-on-cta)" : "var(--color-text-muted)",
                border: "none",
                borderRadius: "var(--r-1)",
                cursor: "pointer",
                transition:
                  "background var(--motion-fast) var(--ease-out-quart), color var(--motion-fast) var(--ease-out-quart)",
              }}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
