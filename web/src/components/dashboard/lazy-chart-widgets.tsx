"use client";

import dynamic from "next/dynamic";
import type { FitnessLog, RecoveryMetrics } from "@/lib/types";

const ChartSkeleton = ({ height = 200 }: { height?: number }) => (
  <div
    style={{ height, borderRadius: "var(--r-1)", background: "var(--color-surface-2)" }}
    aria-hidden
  />
);

export const LazyBodyFitnessSummary = dynamic(
  () => import("@/components/dashboard/body-fitness-summary"),
  { ssr: false, loading: () => <ChartSkeleton /> },
);

export const LazyHealthBreakdown = dynamic(
  () => import("@/components/dashboard/health-breakdown"),
  { ssr: false, loading: () => <ChartSkeleton height={280} /> },
);

// Re-export prop types so the server component can import them from here
export type { FitnessLog, RecoveryMetrics };
