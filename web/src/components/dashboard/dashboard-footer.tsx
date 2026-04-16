"use client";

import { useSyncAll } from "./use-sync-all";

type Props = {
  refreshStocks: () => Promise<{ rateLimited: boolean }>;
  refreshSports: () => Promise<void>;
};

export default function DashboardFooter({ refreshStocks, refreshSports }: Props) {
  const { run, state, syncedAt, errors } = useSyncAll({ refreshStocks, refreshSports });
  const errorSummary = Object.entries(errors)
    .map(([src, msg]) => `${src}: ${msg}`)
    .join(" · ");

  const statusLabel =
    state === "syncing"
      ? "Syncing…"
      : state === "error"
        ? "Sync failed"
        : syncedAt
          ? `Last synced ${syncedAt}`
          : "Not synced this session";

  return (
    <footer
      style={{
        marginTop: "var(--space-9)",
        paddingTop: "var(--space-4)",
        borderTop: "1px solid var(--rule)",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        fontSize: "var(--t-micro)",
        color: "var(--color-text-faint)",
        letterSpacing: "0.02em",
        flexWrap: "wrap",
        gap: "var(--space-3)",
      }}
      className="print:hidden"
    >
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-1)" }}>
        <span
          className="tnum"
          style={{
            color: state === "error" ? "var(--color-danger)" : "var(--color-text-faint)",
          }}
        >
          {statusLabel}
        </span>
        {state === "error" && errorSummary && (
          <span className="tnum" style={{ color: "var(--color-danger)" }}>
            {errorSummary}
          </span>
        )}
      </div>
      <button
        onClick={run}
        disabled={state === "syncing"}
        title="Sync Oura, Fitbit, Google Fit, stocks, and sports in parallel"
        style={{
          fontFamily: "var(--font-body), system-ui, sans-serif",
          background: "transparent",
          border: "1px solid var(--rule)",
          color: "var(--color-text)",
          padding: "10px 14px",
          borderRadius: "var(--r-1)",
          cursor: state === "syncing" ? "default" : "pointer",
          letterSpacing: "0.02em",
          transition: "border-color var(--motion-fast) var(--ease-out-quart)",
          minHeight: 44,
          minWidth: 44,
          opacity: state === "syncing" ? 0.5 : 1,
        }}
        className="hover-border-strong"
      >
        {state === "syncing" ? "Syncing…" : "Refresh"}
      </button>
    </footer>
  );
}
