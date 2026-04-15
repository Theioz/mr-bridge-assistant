"use client";

import { useEffect, useState } from "react";
import { Gift } from "lucide-react";
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

  if (loading || !birthday) return null;

  const isToday = birthday.daysUntil === 0;
  const label = isToday
    ? "Today!"
    : `in ${birthday.daysUntil} day${birthday.daysUntil === 1 ? "" : "s"} (${formatDisplayDate(birthday.date)})`;

  const containerStyle: React.CSSProperties = isToday
    ? {
        background: "color-mix(in srgb, var(--color-cta) 15%, transparent)",
        border: "1px solid color-mix(in srgb, var(--color-cta) 40%, transparent)",
        color: "var(--color-cta)",
      }
    : {
        background: "var(--color-surface)",
        border: "1px solid var(--color-border)",
        color: "var(--color-text-muted)",
      };

  return (
    <div className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm" style={containerStyle}>
      <Gift size={13} style={{ color: "var(--color-cta)", flexShrink: 0 }} />
      <span>
        <span style={{ color: isToday ? "var(--color-cta)" : "var(--color-text)", fontWeight: isToday ? 500 : 400 }}>
          {birthday.name}&apos;s birthday
        </span>
        {" — "}
        <span style={{ color: isToday ? "var(--color-cta)" : "var(--color-text-muted)", fontWeight: isToday ? 600 : 400 }}>
          {label}
        </span>
      </span>
    </div>
  );
}
