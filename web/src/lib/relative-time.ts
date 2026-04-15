export function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function formatRelative(iso: string, now: Date = new Date()): string {
  const then = new Date(iso);
  const diffMs = now.getTime() - then.getTime();
  const diffSec = Math.floor(diffMs / 1000);

  if (diffSec < 60) return "just now";
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (isSameDay(then, yesterday)) return "Yesterday";

  const diffDay = Math.floor((now.getTime() - then.getTime()) / (24 * 3600 * 1000));
  if (diffDay < 7) {
    return then.toLocaleDateString("en-US", { weekday: "long" });
  }

  if (then.getFullYear() === now.getFullYear()) {
    return then.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  }

  return then.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function formatDaySeparator(d: Date, now: Date = new Date()): string {
  if (isSameDay(d, now)) return "Today";
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (isSameDay(d, yesterday)) return "Yesterday";
  if (d.getFullYear() === now.getFullYear()) {
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  }
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function daysUntilPurge(deletedAtIso: string, now: Date = new Date()): number {
  const deletedAt = new Date(deletedAtIso).getTime();
  const elapsedDays = Math.floor((now.getTime() - deletedAt) / (24 * 3600 * 1000));
  return Math.max(0, 30 - elapsedDays);
}
