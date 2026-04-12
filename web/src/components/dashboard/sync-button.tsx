"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type SyncState = "idle" | "syncing" | "done" | "error";

export default function SyncButton() {
  const router = useRouter();
  const [state, setState] = useState<SyncState>("idle");
  const [syncedAt, setSyncedAt] = useState<string | null>(null);

  async function handleSync() {
    setState("syncing");
    try {
      // All three sources in parallel
      const results = await Promise.allSettled([
        fetch("/api/sync/oura", { method: "POST" }),
        fetch("/api/sync/fitbit", { method: "POST" }),
        fetch("/api/sync/googlefit", { method: "POST" }),
      ]);

      const anyFailed = results.some((r) => r.status === "rejected" || (r.status === "fulfilled" && !r.value.ok));
      setState(anyFailed ? "error" : "done");
      if (!anyFailed) {
        setSyncedAt(
          new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }),
        );
      }
      router.refresh();
    } catch {
      setState("error");
    }
  }

  return (
    <button
      onClick={handleSync}
      disabled={state === "syncing"}
      title={syncedAt ? `Last synced ${syncedAt}` : "Sync all data sources"}
      className="flex items-center gap-1.5 text-xs text-neutral-500 hover:text-neutral-300 disabled:opacity-40 transition-colors"
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
        <span className="text-red-500">Sync failed</span>
      ) : state === "syncing" ? (
        "Syncing…"
      ) : syncedAt ? (
        `Synced ${syncedAt}`
      ) : (
        "Sync"
      )}
    </button>
  );
}
