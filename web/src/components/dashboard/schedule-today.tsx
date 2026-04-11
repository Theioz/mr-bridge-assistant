"use client";

import { useEffect, useState } from "react";
import { Calendar, Gift } from "lucide-react";
import type { CalendarEvent } from "@/app/api/google/calendar/route";

function parseTimeToMinutes(timeStr: string): number | null {
  // Handles "9:00 AM", "2:30 PM" — returns minutes since midnight
  const match = timeStr.match(/(\d+):(\d+)\s*(AM|PM)/i);
  if (!match) return null;
  let h = parseInt(match[1]);
  const m = parseInt(match[2]);
  const ampm = match[3].toUpperCase();
  if (ampm === "PM" && h !== 12) h += 12;
  if (ampm === "AM" && h === 12) h = 0;
  return h * 60 + m;
}

export default function ScheduleToday() {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [nowMinutes, setNowMinutes] = useState<number | null>(null);

  useEffect(() => {
    fetch("/api/google/calendar")
      .then((r) => r.json())
      .then((d) => {
        if (d.error) { setError(true); return; }
        setEvents(d.events ?? []);
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));

    const now = new Date();
    setNowMinutes(now.getHours() * 60 + now.getMinutes());
  }, []);

  // Split events into past / upcoming based on start time
  type RenderedItem =
    | { type: "event"; event: CalendarEvent; isPast: boolean; index: number }
    | { type: "now" };

  let nowDividerInserted = false;
  const renderedItems: RenderedItem[] = [];

  if (nowMinutes !== null && events.length > 0) {
    for (let i = 0; i < events.length; i++) {
      const event = events[i];
      const eventMins = parseTimeToMinutes(event.time);
      const isPast = eventMins !== null && eventMins < nowMinutes;

      // Insert "now" divider at the transition from past to upcoming
      if (!nowDividerInserted && eventMins !== null && eventMins >= nowMinutes) {
        const hasPastEvents = renderedItems.some((r) => r.type === "event" && r.isPast);
        if (hasPastEvents) {
          renderedItems.push({ type: "now" });
        }
        nowDividerInserted = true;
      }

      renderedItems.push({ type: "event", event, isPast, index: i });
    }
  }

  const useEnhanced = nowMinutes !== null && renderedItems.length > 0;

  return (
    <div className="bg-neutral-900 rounded-xl p-4 border border-neutral-800 h-full">
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
          {useEnhanced ? (
            renderedItems.map((item, idx) => {
              if (item.type === "now") {
                return (
                  <div key="now-divider" className="flex items-center gap-2 py-0.5">
                    <span className="text-[10px] text-blue-400 font-[family-name:var(--font-mono)] shrink-0">now</span>
                    <div className="flex-1 h-px bg-blue-500/30" />
                  </div>
                );
              }
              const { event, isPast } = item;
              return (
                <div key={idx} className={`flex gap-3 items-start transition-opacity ${isPast ? "opacity-40" : ""}`}>
                  <span className="text-xs font-[family-name:var(--font-mono)] text-neutral-500 shrink-0 w-16 pt-px flex items-center">
                    {event.isBirthday
                      ? <Gift size={12} className="text-rose-400" />
                      : event.time}
                  </span>
                  <div className="min-w-0">
                    <p className={`text-sm leading-snug truncate ${isPast ? "text-neutral-400" : event.isBirthday ? "text-rose-300" : "text-neutral-200"}`}>
                      {event.title}
                    </p>
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
              );
            })
          ) : (
            events.map((event, i) => (
              <div key={i} className="flex gap-3 items-start">
                <span className="text-xs font-[family-name:var(--font-mono)] text-neutral-500 shrink-0 w-16 pt-px flex items-center">
                  {event.isBirthday
                    ? <Gift size={12} className="text-rose-400" />
                    : event.time}
                </span>
                <div className="min-w-0">
                  <p className={`text-sm leading-snug truncate ${event.isBirthday ? "text-rose-300" : "text-neutral-200"}`}>{event.title}</p>
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
            ))
          )}
        </div>
      ) : (
        <p className="text-sm text-neutral-600">No events today</p>
      )}
    </div>
  );
}
