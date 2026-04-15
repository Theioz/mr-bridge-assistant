"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type SyncState = "idle" | "syncing" | "done" | "error";

const SOURCES = ["oura", "fitbit", "googlefit"] as const;
type Source = (typeof SOURCES)[number];

export default function SyncButton() {
  const router = useRouter();
  const [state, setState] = useState<SyncState>("idle");
  const [syncedAt, setSyncedAt] = useState<string | null>(null);
  const [errors, setErrors] = useState<Partial<Record<Source, string>>>({});

  async function handleSync() {
    setState("syncing");
    setErrors({});
    try {
      const results = await Promise.allSettled([
        fetch("/api/sync/oura",      { method: "POST" }),
        fetch("/api/sync/fitbit",    { method: "POST" }),
        fetch("/api/sync/googlefit", { method: "POST" }),
      ]);

      const newErrors: Partial<Record<Source, string>> = {};
      for (let i = 0; i < results.length; i++) {
        const source = SOURCES[i] as Source;
        const result = results[i];
        if (result.status === "rejected") {
          newErrors[source] = "Network error";
          continue;
        }
        if (!result.value.ok) {
          try {
            const body = await result.value.json();
            newErrors[source] = body.error ?? "Sync failed";
          } catch {
            newErrors[source] = "Sync failed";
          }
        }
      }

      const anyFailed = Object.keys(newErrors).length > 0;
      setErrors(newErrors);
      setState(anyFailed ? "error" : "done");
      if (!anyFailed) {
        setSyncedAt(
          new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }),
        );
      }
      router.refresh();
    } catch {
      setState("error");
      setErrors({ oura: "Unexpected error" });
    }
  }

  const errorSummary = Object.entries(errors)
    .map(([src, msg]) => `${src}: ${msg}`)
    .join(" · ");

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        onClick={handleSync}
        disabled={state === "syncing"}
        title={syncedAt ? `Last synced ${syncedAt}` : "Sync all data sources"}
        className="flex items-center gap-1.5 text-xs disabled:opacity-40 transition-colors"
        style={{ color: "var(--color-text-faint)" }}
        onMouseEnter={(e) => (e.currentTarget.style.color = "var(--color-text-muted)")}
        onMouseLeave={(e) => (e.currentTarget.style.color = "var(--color-text-faint)")}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={state === "syncing" ? "animate-spin" : ""}
        >
          <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
          <path d="M21 3v5h-5" />
          <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
          <path d="M8 16H3v5" />
        </svg>
        {state === "error" ? (
          <span style={{ color: "var(--color-danger)" }}>Sync failed</span>
        ) : state === "syncing" ? (
          "Syncing…"
        ) : syncedAt ? (
          `Synced ${syncedAt}`
        ) : (
          "Sync"
        )}
      </button>

      {state === "error" && errorSummary && (
        <p className="text-xs text-right" style={{ color: "var(--color-danger)", maxWidth: 260 }}>
          {errorSummary}
        </p>
      )}
    </div>
  );
}
