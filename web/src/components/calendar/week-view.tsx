"use client";

import { useRef, useEffect, type CSSProperties } from "react";
import type { CalendarRangeEvent } from "@/lib/calendar-types";

// ── Helpers ──────────────────────────────────────────────────────────────────

const HOUR_HEIGHT = 64; // px per hour
const TIME_COL_WIDTH = 48; // px

function toMinutes(isoOrTime: string): number {
  // ISO datetime: "2026-04-21T09:30:00" → minutes since midnight
  const t = isoOrTime.includes("T") ? isoOrTime.split("T")[1] : isoOrTime;
  const [h, m] = t.split(":").map(Number);
  return h * 60 + (m || 0);
}

function formatHour(h: number): string {
  if (h === 0) return "12 AM";
  if (h === 12) return "12 PM";
  return h < 12 ? `${h} AM` : `${h - 12} PM`;
}

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function startOfWeek(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay(); // 0 = Sunday
  d.setDate(d.getDate() - day);
  return d;
}

function addDay(date: Date, n: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

function formatDayHeader(date: Date, short = false): { dow: string; day: number } {
  return {
    dow: date.toLocaleDateString("en-US", { weekday: short ? "narrow" : "short" }),
    day: date.getDate(),
  };
}

// ── Overlap layout ────────────────────────────────────────────────────────────

interface LayoutEvent {
  event: CalendarRangeEvent;
  top: number;
  height: number;
  left: string;
  width: string;
}

function layoutDayEvents(events: CalendarRangeEvent[]): LayoutEvent[] {
  const timed = events.filter((e) => !e.allDay);
  const sorted = [...timed].sort((a, b) => a.start.localeCompare(b.start));

  // Assign columns (greedy interval scheduling)
  const colEnds: string[] = [];
  const assigned: { event: CalendarRangeEvent; col: number }[] = [];

  for (const event of sorted) {
    let col = colEnds.findIndex((end) => end <= event.start);
    if (col === -1) col = colEnds.length;
    colEnds[col] = event.end;
    assigned.push({ event, col });
  }

  const totalCols = Math.max(1, colEnds.length);

  return assigned.map(({ event, col }) => {
    const startMin = toMinutes(event.start);
    const endMin = toMinutes(event.end);
    const duration = Math.max(endMin - startMin, 30); // min 30 min height
    return {
      event,
      top: (startMin / 60) * HOUR_HEIGHT,
      height: (duration / 60) * HOUR_HEIGHT,
      left: `${(col / totalCols) * 100}%`,
      width: `${(1 / totalCols) * 100}%`,
    };
  });
}

// ── Color by calendarType ─────────────────────────────────────────────────────

const TYPE_COLORS: Record<string, { bg: string; text: string }> = {
  primary: { bg: "var(--accent-soft)", text: "var(--accent)" },
  birthday: { bg: "oklch(30% 0.06 320 / 0.3)", text: "oklch(80% 0.12 320)" },
  holiday: { bg: "oklch(30% 0.06 150 / 0.3)", text: "oklch(75% 0.12 150)" },
  other: { bg: "oklch(30% 0.04 var(--hue) / 0.3)", text: "var(--color-text-muted)" },
};

function eventColors(type: string) {
  return TYPE_COLORS[type] ?? TYPE_COLORS.other;
}

// ── WeekView / DayView ────────────────────────────────────────────────────────

interface WeekViewProps {
  events: CalendarRangeEvent[];
  currentDate: Date;
  view: "week" | "day";
  onSlotClick: (date: string, time: string) => void;
  onEventClick: (event: CalendarRangeEvent) => void;
}

const HOURS = Array.from({ length: 24 }, (_, i) => i);

export default function WeekView({ events, currentDate, view, onSlotClick, onEventClick }: WeekViewProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Scroll to 7am on mount
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = 7 * HOUR_HEIGHT;
    }
  }, []);

  const weekStart = view === "week" ? startOfWeek(currentDate) : currentDate;
  const dayCount = view === "week" ? 7 : 1;
  const days = Array.from({ length: dayCount }, (_, i) => addDay(weekStart, i));
  const todayStr = isoDate(new Date());

  // Group events by date
  const eventsByDate: Record<string, CalendarRangeEvent[]> = {};
  for (const event of events) {
    const dateKey = event.start.slice(0, 10);
    (eventsByDate[dateKey] ??= []).push(event);
  }

  // All-day events for this range
  const allDayByDate: Record<string, CalendarRangeEvent[]> = {};
  for (const day of days) {
    const key = isoDate(day);
    const allDay = (eventsByDate[key] ?? []).filter((e) => e.allDay);
    if (allDay.length) allDayByDate[key] = allDay;
  }
  const hasAllDay = Object.keys(allDayByDate).length > 0;

  const colTemplate = `${TIME_COL_WIDTH}px repeat(${dayCount}, 1fr)`;

  return (
    <div className="flex flex-col" style={{ flex: 1, minHeight: 0 }}>
      {/* Day headers */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: colTemplate,
          borderBottom: "1px solid var(--rule-soft)",
          flexShrink: 0,
        }}
      >
        <div style={{ background: "var(--color-bg)" }} /> {/* spacer */}
        {days.map((day) => {
          const key = isoDate(day);
          const isToday = key === todayStr;
          const { dow, day: dayNum } = formatDayHeader(day);
          const dayOfWeek = day.getDay();
          const isWeekendHeader = dayOfWeek === 0 || dayOfWeek === 6;
          return (
            <div
              key={key}
              className="flex flex-col items-center justify-end"
              style={{
                padding: "var(--space-2) var(--space-1) var(--space-2)",
                borderLeft: "1px solid var(--rule-soft)",
                background: isWeekendHeader ? "var(--color-surface)" : "var(--color-bg)",
              }}
            >
              <span
                style={{
                  fontSize: "var(--t-micro)",
                  color: isToday ? "var(--accent)" : "var(--color-text-muted)",
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                  fontWeight: 500,
                }}
              >
                {dow}
              </span>
              <span
                style={{
                  fontSize: "var(--t-meta)",
                  fontWeight: isToday ? 700 : 400,
                  color: isToday ? "var(--accent)" : "var(--color-text)",
                  lineHeight: 1.4,
                }}
              >
                {dayNum}
              </span>
            </div>
          );
        })}
      </div>

      {/* All-day row */}
      {hasAllDay && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: colTemplate,
            borderBottom: "1px solid var(--rule-soft)",
            flexShrink: 0,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "flex-end",
              padding: "0 var(--space-2)",
              fontSize: "var(--t-micro)",
              color: "var(--color-text-faint)",
            }}
          >
            all-day
          </div>
          {days.map((day) => {
            const key = isoDate(day);
            const allDay = allDayByDate[key] ?? [];
            return (
              <div
                key={key}
                style={{
                  borderLeft: "1px solid var(--rule-soft)",
                  padding: "var(--space-1)",
                  display: "flex",
                  flexDirection: "column",
                  gap: 2,
                  minHeight: 28,
                }}
              >
                {allDay.map((e) => {
                  const { bg, text } = eventColors(e.calendarType);
                  return (
                    <button
                      key={e.eventId}
                      onClick={() => onEventClick(e)}
                      style={{
                        background: bg,
                        color: text,
                        borderRadius: 4,
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
                      {e.title}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      )}

      {/* Scrollable time grid */}
      <div
        ref={scrollRef}
        style={{ flex: 1, overflowY: "auto", position: "relative" }}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: colTemplate,
            height: 24 * HOUR_HEIGHT,
          }}
        >
          {/* Hour labels */}
          <div style={{ position: "relative" }}>
            {HOURS.map((h) => (
              <div
                key={h}
                style={{
                  position: "absolute",
                  top: h * HOUR_HEIGHT - 8,
                  right: "var(--space-2)",
                  fontSize: "var(--t-micro)",
                  color: "var(--color-text-faint)",
                  whiteSpace: "nowrap",
                  userSelect: "none",
                }}
              >
                {h === 0 ? "" : formatHour(h)}
              </div>
            ))}
          </div>

          {/* Day columns */}
          {days.map((day) => {
            const key = isoDate(day);
            const dayEvents = eventsByDate[key] ?? [];
            const laid = layoutDayEvents(dayEvents);
            const dow = day.getDay(); // 0=Sun, 6=Sat
            const isWeekend = dow === 0 || dow === 6;

            return (
              <div
                key={key}
                style={{
                  position: "relative",
                  borderLeft: "1px solid var(--rule-soft)",
                  height: 24 * HOUR_HEIGHT,
                  background: isWeekend ? "var(--color-surface)" : "transparent",
                }}
              >
                {/* Hour grid lines */}
                {HOURS.map((h) => (
                  <div
                    key={h}
                    onClick={() => {
                      const time = `${String(h).padStart(2, "0")}:00`;
                      onSlotClick(key, time);
                    }}
                    style={{
                      position: "absolute",
                      top: h * HOUR_HEIGHT,
                      left: 0,
                      right: 0,
                      height: HOUR_HEIGHT,
                      borderTop: h === 0 ? "none" : "1px solid var(--rule-soft)",
                      cursor: "default",
                    }}
                  />
                ))}

                {/* Events */}
                {laid.map(({ event, top, height, left, width }) => {
                  const { bg, text } = eventColors(event.calendarType);
                  const style: CSSProperties = {
                    position: "absolute",
                    top,
                    height: Math.max(height, 20),
                    left,
                    width,
                    background: bg,
                    color: text,
                    borderRadius: 4,
                    padding: "2px var(--space-1)",
                    fontSize: "var(--t-micro)",
                    fontWeight: 500,
                    overflow: "hidden",
                    cursor: "pointer",
                    border: "none",
                    boxSizing: "border-box",
                    zIndex: 1,
                    display: "flex",
                    flexDirection: "column",
                    lineHeight: 1.3,
                  };
                  return (
                    <button
                      key={event.eventId}
                      onClick={(ev) => {
                        ev.stopPropagation();
                        onEventClick(event);
                      }}
                      style={style}
                    >
                      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {event.title}
                      </span>
                      {height >= 40 && event.location && (
                        <span
                          style={{
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                            opacity: 0.75,
                            fontWeight: 400,
                          }}
                        >
                          {event.location}
                        </span>
                      )}
                    </button>
                  );
                })}

                {/* Current time indicator */}
                {key === todayStr && <CurrentTimeBar />}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function CurrentTimeBar() {
  const now = new Date();
  const minutes = now.getHours() * 60 + now.getMinutes();
  const top = (minutes / 60) * HOUR_HEIGHT;

  return (
    <div
      aria-hidden
      style={{
        position: "absolute",
        top,
        left: 0,
        right: 0,
        height: 2,
        background: "var(--accent)",
        zIndex: 2,
        pointerEvents: "none",
      }}
    >
      <div
        style={{
          position: "absolute",
          left: -4,
          top: -3,
          width: 8,
          height: 8,
          borderRadius: "50%",
          background: "var(--accent)",
        }}
      />
    </div>
  );
}
