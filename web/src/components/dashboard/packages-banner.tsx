"use client";

import { useEffect, useRef, useState } from "react";
import type { PackagesApiResponse } from "@/app/api/packages/route";
import type { Package } from "@/lib/types";

const SIX_HOURS_MS = 6 * 60 * 60 * 1000;

function todayDateString(): string {
  return new Date().toLocaleDateString("en-CA");
}

function addDays(dateStr: string, n: number): string {
  const d = new Date(`${dateStr}T12:00:00`);
  d.setDate(d.getDate() + n);
  return d.toLocaleDateString("en-CA");
}

interface BannerContent {
  primaryLabel: string;
  trailingLabel: string;
  isUrgent: boolean;
}

function computeBannerContent(packages: Package[]): BannerContent | null {
  const today = todayDateString();
  const tomorrow = addDays(today, 1);
  const weekEnd = addDays(today, 7);

  const active = packages.filter((p) => p.status !== "delivered" && p.status !== "expired");
  if (active.length === 0) return null;

  const todayPkgs = active.filter((p) => p.estimated_delivery === today);
  const tomorrowPkgs = active.filter((p) => p.estimated_delivery === tomorrow);
  const weekPkgs = active.filter(
    (p) =>
      p.estimated_delivery != null &&
      p.estimated_delivery > tomorrow &&
      p.estimated_delivery <= weekEnd,
  );
  const trackingOnly = active.filter((p) => p.estimated_delivery == null);

  if (todayPkgs.length > 0) {
    const pkg = todayPkgs.length === 1 ? todayPkgs[0] : null;
    return {
      primaryLabel: pkg
        ? [pkg.retailer, pkg.description].filter(Boolean).join(" · ").slice(0, 60)
        : `${todayPkgs.length} packages`,
      trailingLabel: "today",
      isUrgent: true,
    };
  }
  if (tomorrowPkgs.length > 0) {
    const pkg = tomorrowPkgs.length === 1 ? tomorrowPkgs[0] : null;
    return {
      primaryLabel: pkg
        ? [pkg.retailer, pkg.description].filter(Boolean).join(" · ").slice(0, 60)
        : `${tomorrowPkgs.length} packages`,
      trailingLabel: "tomorrow",
      isUrgent: false,
    };
  }
  if (weekPkgs.length > 0) {
    return {
      primaryLabel: `${weekPkgs.length} package${weekPkgs.length === 1 ? "" : "s"}`,
      trailingLabel: "this week",
      isUrgent: false,
    };
  }
  if (trackingOnly.length > 0) {
    return {
      primaryLabel: `${trackingOnly.length} package${trackingOnly.length === 1 ? "" : "s"}`,
      trailingLabel: "tracking",
      isUrgent: false,
    };
  }
  return null;
}

export default function PackagesBanner() {
  const [packages, setPackages] = useState<Package[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const autoSyncedRef = useRef(false);

  useEffect(() => {
    fetch("/api/packages")
      .then((r) => r.json() as Promise<PackagesApiResponse>)
      .then((data) => {
        setPackages(data.packages ?? []);

        if (autoSyncedRef.current) return;
        autoSyncedRef.current = true;

        const isStale =
          !data.lastSyncedAt || Date.now() - new Date(data.lastSyncedAt).getTime() > SIX_HOURS_MS;
        if (!isStale) return;

        setSyncing(true);
        fetch("/api/sync/packages", { method: "POST" })
          .then((r) =>
            r.ok
              ? fetch("/api/packages")
                  .then((r2) => r2.json() as Promise<PackagesApiResponse>)
                  .then((refreshed) => setPackages(refreshed.packages ?? []))
              : null,
          )
          .catch(() => {})
          .finally(() => setSyncing(false));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div style={{ minHeight: "1.75rem" }} aria-hidden />;
  }

  const content = computeBannerContent(packages);
  if (!content) return null;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "var(--space-3)",
        padding: "var(--space-2) 0",
        borderTop: "1px solid var(--rule-soft)",
        borderBottom: "1px solid var(--rule-soft)",
        fontSize: "var(--t-meta)",
        color: "var(--color-text-muted)",
        opacity: syncing ? 0.5 : 1,
        transition: "opacity var(--motion-fast) var(--ease-out-quart)",
        minWidth: 0,
      }}
    >
      <span
        aria-hidden
        style={{
          width: 6,
          height: 6,
          borderRadius: 999,
          background: "var(--accent)",
          flexShrink: 0,
        }}
      />
      <span
        style={{
          color: "var(--color-text)",
          fontWeight: content.isUrgent ? 500 : 400,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          flex: 1,
          minWidth: 0,
        }}
      >
        {content.primaryLabel}
      </span>
      <span style={{ color: "var(--color-text-faint)", flexShrink: 0 }} className="tnum">
        {content.trailingLabel}
      </span>
    </div>
  );
}
