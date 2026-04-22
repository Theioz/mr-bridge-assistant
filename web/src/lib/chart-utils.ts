import type { WindowKey } from "@/lib/window";

/** Format a YYYY-MM-DD string as "Apr 11" */
export function formatDate(dateStr: string): string {
  return new Date(dateStr + "T00:00:00").toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

/** Derive the WindowKey from a days count (inverse of WINDOW_DAYS). */
export function daysToWindowKey(days: number): WindowKey {
  if (days <= 7) return "7d";
  if (days <= 14) return "14d";
  if (days <= 30) return "30d";
  if (days <= 90) return "90d";
  return "1yr";
}

/**
 * Given the full array of YYYY-MM-DD date strings and the active window key,
 * returns a subset of dates formatted as "Apr 11" to use as XAxis ticks.
 *
 * Density rules:
 *   7d       → all ticks
 *   14d/30d  → Mondays only
 *   90d/1yr  → every 14th date starting from index 0
 */
export function computeDailyTicks(dates: string[], windowKey: WindowKey): string[] {
  if (dates.length === 0) return [];

  if (windowKey === "7d") {
    return dates.map(formatDate);
  }

  if (windowKey === "14d" || windowKey === "30d") {
    return dates.filter((d) => new Date(d + "T00:00:00").getDay() === 1).map(formatDate);
  }

  // 90d or 1yr: every 14th index starting from the first
  return dates.filter((_, i) => i % 14 === 0).map(formatDate);
}

/**
 * Given the full array of week label strings and the week count,
 * returns a subset of labels to use as XAxis ticks.
 *
 * Density rules:
 *   ≤8 weeks  → all
 *   9–26 weeks → every 2nd
 *   >26 weeks  → every 4th
 */
export function computeWeeklyTicks(labels: string[], weekCount: number): string[] {
  if (weekCount <= 8) return [...labels];
  if (weekCount <= 26) return labels.filter((_, i) => i % 2 === 0);
  return labels.filter((_, i) => i % 4 === 0);
}
