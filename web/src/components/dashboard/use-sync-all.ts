"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type SyncState = "idle" | "syncing" | "done" | "error";

const HEALTH_SOURCES = ["oura", "fitbit", "googlefit"] as const;
type HealthSource = (typeof HEALTH_SOURCES)[number];
type AnySource = HealthSource | "stocks" | "sports";

type Options = {
  refreshStocks?: () => Promise<unknown>;
  refreshSports?: () => Promise<unknown>;
};

export function useSyncAll({ refreshStocks, refreshSports }: Options = {}) {
  const router = useRouter();
  const [state, setState] = useState<SyncState>("idle");
  const [syncedAt, setSyncedAt] = useState<string | null>(null);
  const [errors, setErrors] = useState<Partial<Record<AnySource, string>>>({});

  async function run() {
    setState("syncing");
    setErrors({});
    try {
      const healthResults = await Promise.allSettled(
        HEALTH_SOURCES.map((src) => fetch(`/api/sync/${src}`, { method: "POST" })),
      );
      const refreshResults = await Promise.allSettled([
        refreshStocks ? refreshStocks() : Promise.resolve(undefined),
        refreshSports ? refreshSports() : Promise.resolve(undefined),
      ]);

      const newErrors: Partial<Record<AnySource, string>> = {};

      for (let i = 0; i < HEALTH_SOURCES.length; i++) {
        const source = HEALTH_SOURCES[i];
        const result = healthResults[i];
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

      if (refreshResults[0].status === "rejected") newErrors.stocks = "Refresh failed";
      if (refreshResults[1].status === "rejected") newErrors.sports = "Refresh failed";

      const anyFailed = Object.keys(newErrors).length > 0;
      setErrors(newErrors);
      setState(anyFailed ? "error" : "done");
      if (!anyFailed) {
        setSyncedAt(new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }));
      }
      router.refresh();
    } catch {
      setState("error");
      setErrors({ oura: "Unexpected error" });
    }
  }

  return { run, state, syncedAt, errors };
}
