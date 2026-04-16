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
        if (d.error) {
          setError(true);
          return;
        }
        setEvents(d.events ?? []);
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));

    const now = new Date();
    setNowMinutes(now.getHours() * 60 + now.getMinutes());
  }, []);

  return (
    <section className="db-section">
      <h2 className="db-section-label">Schedule</h2>

      {loading ? (
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              style={{
                display: "grid",
                gridTemplateColumns: "4.5rem 1fr",
                gap: "var(--space-4)",
                padding: "var(--space-3) 0",
              }}
            >
              <div className="skeleton" style={{ height: 14 }} />
              <div className="skeleton" style={{ height: 14 }} />
            </div>
          ))}
        </div>
      ) : error ? (
        <EmptyState icon={Calendar} variant="error" paddingY={16}>
          Calendar unavailable — check Google credentials
        </EmptyState>
      ) : events.length > 0 ? (
        <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
          {events.map((event, i) => {
            const eventMins = parseTimeToMinutes(event.time);
            const isPast = nowMinutes !== null && eventMins !== null && eventMins < nowMinutes;
            return (
              <li
                key={i}
                className="db-row"
                style={{
                  gridTemplateColumns: "4.5rem 1fr auto",
                  opacity: isPast ? 0.5 : 1,
                  transition: "opacity var(--motion-fast) var(--ease-out-quart)",
                }}
              >
                <span
                  className="tnum font-heading"
                  style={{
                    fontWeight: 500,
                    color: "var(--color-text)",
                    display: "flex",
                    alignItems: "center",
                    gap: "var(--space-2)",
                  }}
                >
                  {event.isBirthday ? (
                    <Gift size={14} style={{ color: "var(--accent)" }} aria-label="Birthday" />
                  ) : (
                    event.time
                  )}
                </span>
                <span
                  style={{
                    color: event.isBirthday ? "var(--accent)" : "var(--color-text)",
                    minWidth: 0,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {event.title}
                  {event.location && (
                    <span
                      style={{
                        color: "var(--color-text-faint)",
                        marginLeft: "var(--space-2)",
                        fontSize: "var(--t-micro)",
                      }}
                    >
                      · {event.location}
                    </span>
                  )}
                </span>
                <span
                  style={{
                    fontSize: "var(--t-micro)",
                    color: "var(--color-text-faint)",
                    textTransform: "lowercase",
                    letterSpacing: "0.02em",
                  }}
                >
                  {event.isPrimary ? "" : event.calendarName}
                </span>
              </li>
            );
          })}
        </ul>
      ) : (
        <EmptyState icon={Calendar} paddingY={16}>
          No events today
        </EmptyState>
      )}
    </section>
  );
}
