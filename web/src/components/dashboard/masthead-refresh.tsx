"use client";

import { RefreshCw } from "lucide-react";
import { useSyncAll } from "./use-sync-all";

type Props = {
  refreshStocks: () => Promise<{ rateLimited: boolean }>;
  refreshSports: () => Promise<void>;
};

export default function MastheadRefresh({ refreshStocks, refreshSports }: Props) {
  const { run, state, syncedAt, errors } = useSyncAll({ refreshStocks, refreshSports });
  const errorSummary = Object.entries(errors)
    .map(([src, msg]) => `${src}: ${msg}`)
    .join(" · ");
  const title =
    state === "syncing"
      ? "Syncing…"
      : state === "error"
        ? errorSummary || "Sync failed"
        : syncedAt
          ? `Last synced ${syncedAt}`
          : "Sync Oura, Fitbit, Google Fit, stocks, and sports";

  return (
    <button
      onClick={run}
      disabled={state === "syncing"}
      title={title}
      aria-label="Refresh all data"
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: 44,
        height: 44,
        background: "transparent",
        border: "1px solid var(--rule)",
        borderRadius: "var(--r-1)",
        color:
          state === "error"
            ? "var(--color-danger)"
            : "var(--color-text-muted)",
        cursor: state === "syncing" ? "default" : "pointer",
        opacity: state === "syncing" ? 0.5 : 1,
        transition:
          "border-color var(--motion-fast) var(--ease-out-quart), color var(--motion-fast) var(--ease-out-quart)",
      }}
      className="hover-border-strong"
    >
      <RefreshCw
        size={15}
        className={state === "syncing" ? "animate-spin" : undefined}
      />
    </button>
  );
}
