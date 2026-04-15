"use client";

import { useEffect, useState } from "react";
import { Calendar, Gift } from "lucide-react";
import EmptyState from "./empty-state";
import type { CalendarEvent } from "@/app/api/google/calendar/route";

function parseTimeToMinutes(timeStr: string): number | null {
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
  const muted = { color: "var(--color-text-muted)" };
  const faint = { color: "var(--color-text-faint)" };
  const text = { color: "var(--color-text)" };
  const accent = { color: "var(--color-cta)" };

  return (
    <div
      className="rounded-xl p-4 h-full transition-all duration-200 card-lift"
      style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)" }}
    >
      <div className="flex items-center gap-2 mb-3">
        <Calendar size={13} style={{ color: "var(--color-text-muted)", flexShrink: 0 }} />
        <p className="text-xs uppercase tracking-wide" style={muted}>Schedule Today</p>
      </div>

      {loading ? (
        <div className="space-y-2.5">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex gap-3">
              <div className="h-3 rounded animate-pulse w-14 shrink-0" style={{ background: "var(--color-surface-raised)" }} />
              <div className="h-3 rounded animate-pulse flex-1" style={{ background: "var(--color-surface-raised)" }} />
            </div>
          ))}
        </div>
      ) : error ? (
        <EmptyState icon={Calendar} variant="error" paddingY={8}>
          Calendar unavailable — check Google credentials
        </EmptyState>
      ) : events.length > 0 ? (
        <div className="space-y-2.5">
          {useEnhanced ? (
            renderedItems.map((item, idx) => {
              if (item.type === "now") {
                return (
                  <div key="now-divider" className="flex items-center gap-2 py-0.5">
                    <span className="text-[10px] font-mono shrink-0" style={{ color: "var(--color-primary)" }}>now</span>
                    <div className="flex-1 h-px" style={{ background: "var(--color-primary)", opacity: 0.3 }} />
                  </div>
                );
              }
              const { event, isPast } = item;
              return (
                <div key={idx} className={`flex gap-3 items-start transition-opacity ${isPast ? "opacity-40" : ""}`}>
                  <span className="text-xs font-mono shrink-0 w-16 pt-px flex items-center" style={muted}>
                    {event.isBirthday
                      ? <Gift size={12} style={accent} />
                      : event.time}
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm leading-snug truncate" style={isPast ? muted : event.isBirthday ? accent : text}>
                      {event.title}
                    </p>
                    {(event.location || !event.isPrimary) && (
                      <p className="text-xs truncate mt-0.5" style={faint}>
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
                <span className="text-xs font-mono shrink-0 w-16 pt-px flex items-center" style={muted}>
                  {event.isBirthday
                    ? <Gift size={12} style={accent} />
                    : event.time}
                </span>
                <div className="min-w-0">
                  <p className="text-sm leading-snug truncate" style={event.isBirthday ? accent : text}>{event.title}</p>
                  {(event.location || !event.isPrimary) && (
                    <p className="text-xs truncate mt-0.5" style={faint}>
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
        <EmptyState icon={Calendar} paddingY={8}>No events today</EmptyState>
      )}
    </div>
  );
}
