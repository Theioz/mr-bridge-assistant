"use client";

import { useEffect, useState } from "react";
import { Calendar } from "lucide-react";
import type { CalendarEvent } from "@/app/api/google/calendar/route";

export default function ScheduleToday() {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    fetch("/api/google/calendar")
      .then((r) => r.json())
      .then((d) => {
        if (d.error) { setError(true); return; }
        setEvents(d.events ?? []);
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="bg-neutral-900 rounded-xl p-4 border border-neutral-800">
      <div className="flex items-center gap-2 mb-3">
        <Calendar size={13} className="text-neutral-500 shrink-0" />
        <p className="text-xs text-neutral-500 uppercase tracking-wide">Schedule Today</p>
      </div>

      {loading ? (
        <div className="space-y-2.5">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex gap-3">
              <div className="h-3 bg-neutral-800 rounded animate-pulse w-14 shrink-0" />
              <div className="h-3 bg-neutral-800 rounded animate-pulse flex-1" />
            </div>
          ))}
        </div>
      ) : error ? (
        <p className="text-sm text-red-400/70">Failed to load — check Google credentials</p>
      ) : events.length > 0 ? (
        <div className="space-y-2.5">
          {events.map((event, i) => (
            <div key={i} className="flex gap-3 items-start">
              <span className="text-xs font-[family-name:var(--font-mono)] text-neutral-500 shrink-0 w-16 pt-px">
                {event.time}
              </span>
              <div className="min-w-0">
                <p className="text-sm text-neutral-200 leading-snug truncate">{event.title}</p>
                {(event.location || !event.isPrimary) && (
                  <p className="text-xs text-neutral-600 truncate mt-0.5">
                    {event.location}
                    {!event.isPrimary && (
                      <span className={event.location ? " · " : ""}>{event.calendarName}</span>
                    )}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-neutral-600">No events today</p>
      )}
    </div>
  );
}
