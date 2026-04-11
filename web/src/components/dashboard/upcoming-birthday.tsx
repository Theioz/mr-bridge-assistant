"use client";

import { useEffect, useState } from "react";
import { Gift } from "lucide-react";
import type { UpcomingBirthday } from "@/app/api/google/calendar/upcoming-birthday/route";

function formatDisplayDate(dateStr: string): string {
  // dateStr is YYYY-MM-DD; append T12:00 to avoid UTC-shift on date-only strings
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

  return (
    <div className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm ${
      isToday
        ? "bg-rose-950/40 border-rose-800/50 text-rose-300"
        : "bg-neutral-900 border-neutral-800 text-neutral-400"
    }`}>
      <Gift size={13} className={isToday ? "text-rose-400 shrink-0" : "text-rose-500/70 shrink-0"} />
      <span>
        <span className={isToday ? "text-rose-300 font-medium" : "text-neutral-200"}>
          {birthday.name}&apos;s birthday
        </span>
        {" — "}
        <span className={isToday ? "text-rose-400 font-semibold" : "text-neutral-500"}>
          {label}
        </span>
      </span>
    </div>
  );
}
