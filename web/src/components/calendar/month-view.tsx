"use client";

import type { CalendarRangeEvent } from "@/lib/calendar-types";

// ── Helpers ───────────────────────────────────────────────────────────────────

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function buildMonthGrid(year: number, month: number): Date[] {
  const first = new Date(year, month, 1);
  const last = new Date(year, month + 1, 0);
  const startPad = first.getDay(); // 0 = Sunday
  const endPad = 6 - last.getDay();
  const days: Date[] = [];
  for (let i = -startPad; i < last.getDate() + endPad; i++) {
    days.push(new Date(year, month, 1 + i));
  }
  return days;
}

const DOW_SHORT = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
const IS_WEEKEND = [true, false, false, false, false, false, true]; // Sun=0, Sat=6

const TYPE_COLORS: Record<string, { bg: string; text: string }> = {
  primary: { bg: "var(--accent-soft)", text: "var(--accent)" },
  birthday: { bg: "oklch(30% 0.06 320 / 0.3)", text: "oklch(80% 0.12 320)" },
  holiday: { bg: "oklch(30% 0.06 150 / 0.3)", text: "oklch(75% 0.12 150)" },
  other: { bg: "oklch(30% 0.04 var(--hue) / 0.3)", text: "var(--color-text-muted)" },
};

const MAX_VISIBLE = 3;

// ── Component ─────────────────────────────────────────────────────────────────

interface MonthViewProps {
  events: CalendarRangeEvent[];
  currentDate: Date;
  onSlotClick: (date: string, time: string) => void;
  onEventClick: (event: CalendarRangeEvent) => void;
}

export default function MonthView({ events, currentDate, onSlotClick, onEventClick }: MonthViewProps) {
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const days = buildMonthGrid(year, month);
  const todayStr = isoDate(new Date());

  // Group events by date
  const eventsByDate: Record<string, CalendarRangeEvent[]> = {};
  for (const event of events) {
    const key = event.start.slice(0, 10);
    (eventsByDate[key] ??= []).push(event);
  }

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
      {/* Calendar grid — no separate header; DOW is inline in each cell */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(7, 1fr)",
          gridAutoRows: "1fr",
          flex: 1,
          minHeight: 0,
          overflow: "auto",
        }}
      >
        {days.map((day, idx) => {
          const key = isoDate(day);
          const isCurrentMonth = day.getMonth() === month;
          const isToday = key === todayStr;
          const dayEvents = (eventsByDate[key] ?? []).sort((a, b) => a.start.localeCompare(b.start));
          const visible = dayEvents.slice(0, MAX_VISIBLE);
          const overflow = dayEvents.length - MAX_VISIBLE;
          const dow = idx % 7; // 0=Sun … 6=Sat
          const isWeekend = IS_WEEKEND[dow];

          return (
            <div
              key={idx}
              onClick={() => onSlotClick(key, "09:00")}
              style={{
                borderTop: "1px solid var(--rule-soft)",
                borderLeft: dow === 0 ? "none" : "1px solid var(--rule-soft)",
                padding: "var(--space-1)",
                cursor: "default",
                opacity: isCurrentMonth ? 1 : 0.35,
                display: "flex",
                flexDirection: "column",
                gap: 2,
                minHeight: 80,
                background: isWeekend ? "var(--color-surface)" : "transparent",
              }}
            >
              {/* DOW label + date number on the same row */}
              <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <span
                  style={{
                    fontSize: "var(--t-micro)",
                    color: isWeekend ? "var(--color-text-muted)" : "var(--color-text-faint)",
                    fontWeight: isWeekend ? 600 : 400,
                    letterSpacing: "0.04em",
                    userSelect: "none",
                    flexShrink: 0,
                  }}
                >
                  {DOW_SHORT[dow]}
                </span>
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    width: 22,
                    height: 22,
                    borderRadius: "50%",
                    fontSize: "var(--t-micro)",
                    fontWeight: isToday ? 700 : 400,
                    color: isToday ? "var(--color-text-on-cta)" : "var(--color-text-muted)",
                    background: isToday ? "var(--accent)" : "transparent",
                    flexShrink: 0,
                  }}
                >
                  {day.getDate()}
                </span>
              </div>

              {/* Event pills */}
              {visible.map((e) => {
                const { bg, text } = TYPE_COLORS[e.calendarType] ?? TYPE_COLORS.other;
                return (
                  <button
                    key={e.eventId}
                    onClick={(ev) => {
                      ev.stopPropagation();
                      onEventClick(e);
                    }}
                    style={{
                      background: bg,
                      color: text,
                      borderRadius: 3,
                      padding: "1px var(--space-1)",
                      fontSize: "var(--t-micro)",
                      fontWeight: 500,
                      textAlign: "left",
                      border: "none",
                      cursor: "pointer",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      width: "100%",
                    }}
                  >
                    {!e.allDay && (
                      <span style={{ opacity: 0.75, fontVariantNumeric: "tabular-nums" }}>
                        {new Date(e.start).toLocaleTimeString("en-US", { hour: "numeric", hour12: true }).replace(" AM", "a").replace(" PM", "p")}{" "}
                      </span>
                    )}
                    {e.title}
                  </button>
                );
              })}

              {overflow > 0 && (
                <span
                  style={{
                    fontSize: "var(--t-micro)",
                    color: "var(--color-text-faint)",
                    padding: "0 var(--space-1)",
                  }}
                >
                  +{overflow} more
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
