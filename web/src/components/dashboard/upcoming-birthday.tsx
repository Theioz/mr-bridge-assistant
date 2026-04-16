"use client";

import { useEffect, useState } from "react";
import type { UpcomingBirthday } from "@/app/api/google/calendar/upcoming-birthday/route";

function formatDisplayDate(dateStr: string): string {
  const d = new Date(`${dateStr}T12:00:00`);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default function UpcomingBirthdayWidget() {
  const [birthday, setBirthday] = useState<UpcomingBirthday | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/google/calendar/upcoming-birthday")
      .then((r) => r.json())
      .then((d) => setBirthday(d.birthday ?? null))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div style={{ minHeight: "1.75rem" }} aria-hidden />;
  }
  if (!birthday) return null;

  const isToday = birthday.daysUntil === 0;
  const label = isToday
    ? "today"
    : `in ${birthday.daysUntil} day${birthday.daysUntil === 1 ? "" : "s"} · ${formatDisplayDate(birthday.date)}`;

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
      }}
    >
      <span
        aria-hidden
        style={{
          width: 6,
          height: 6,
          borderRadius: 999,
          background: "var(--accent)",
        }}
      />
      <span style={{ color: "var(--color-text)", fontWeight: isToday ? 500 : 400 }}>
        {birthday.name}&apos;s birthday
      </span>
      <span style={{ color: "var(--color-text-faint)" }} className="tnum">
        {label}
      </span>
    </div>
  );
}
