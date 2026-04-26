"use client";

import { useState, useEffect } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { CalendarRangeEvent, CalendarRangeResponse } from "@/lib/calendar-types";
import WeekView from "./week-view";
import MonthView from "./month-view";
import EventModal from "./event-modal";
import EventDetailDialog from "./event-detail-dialog";

// ── Types & helpers ───────────────────────────────────────────────────────────

type View = "week" | "day" | "month";

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function addDays(d: Date, n: number): Date {
  const copy = new Date(d);
  copy.setDate(copy.getDate() + n);
  return copy;
}

function startOfWeek(d: Date): Date {
  const copy = new Date(d);
  copy.setDate(copy.getDate() - copy.getDay());
  return copy;
}

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function endOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0);
}

function rangeForView(view: View, current: Date): { timeMin: string; timeMax: string } {
  if (view === "day") {
    const s = isoDate(current);
    return { timeMin: s, timeMax: s };
  }
  if (view === "week") {
    const s = startOfWeek(current);
    return { timeMin: isoDate(s), timeMax: isoDate(addDays(s, 6)) };
  }
  // month — add a buffer week on each side so partial weeks are visible
  return {
    timeMin: isoDate(addDays(startOfMonth(current), -7)),
    timeMax: isoDate(addDays(endOfMonth(current), 7)),
  };
}

function headerLabel(view: View, current: Date): string {
  if (view === "day") {
    return current.toLocaleDateString("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
    });
  }
  if (view === "week") {
    const s = startOfWeek(current);
    const e = addDays(s, 6);
    if (s.getMonth() === e.getMonth()) {
      return `${s.toLocaleDateString("en-US", { month: "long" })} ${s.getFullYear()}`;
    }
    return `${s.toLocaleDateString("en-US", { month: "short" })} – ${e.toLocaleDateString("en-US", { month: "short", year: "numeric" })}`;
  }
  return current.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

function navigate(view: View, current: Date, dir: -1 | 1): Date {
  if (view === "day") return addDays(current, dir);
  if (view === "week") return addDays(current, dir * 7);
  const d = new Date(current);
  d.setMonth(d.getMonth() + dir);
  return d;
}

// ── Button styles ─────────────────────────────────────────────────────────────

const btnBase = {
  background: "transparent",
  border: "1px solid var(--color-border)",
  borderRadius: "var(--r-2)",
  color: "var(--color-text-muted)",
  cursor: "pointer",
  fontSize: "var(--t-meta)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "var(--space-2)",
} as const;

// ── CalendarView ──────────────────────────────────────────────────────────────

export default function CalendarView() {
  const [view, setView] = useState<View>("week");
  const [current, setCurrent] = useState(() => new Date());
  // null = loading; array = loaded (even if empty)
  const [events, setEvents] = useState<CalendarRangeEvent[] | null>(null);
  const [notConnected, setNotConnected] = useState(false);
  // Increment to force a refetch without changing view/current (after save/delete)
  const [refreshKey, setRefreshKey] = useState(0);

  // Modal state
  const [createOpen, setCreateOpen] = useState(false);
  const [createDate, setCreateDate] = useState("");
  const [createTime, setCreateTime] = useState("");
  const [editEvent, setEditEvent] = useState<CalendarRangeEvent | null>(null);

  // Detail dialog state
  const [detailEvent, setDetailEvent] = useState<CalendarRangeEvent | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  // Fetch whenever view, current date, or refreshKey changes.
  // All setState calls here are inside async callbacks — not synchronous in the effect body.
  useEffect(() => {
    let cancelled = false;
    const { timeMin, timeMax } = rangeForView(view, current);
    fetch(`/api/google/calendar/range?timeMin=${timeMin}&timeMax=${timeMax}`)
      .then((r) => r.json())
      .then((data: CalendarRangeResponse) => {
        if (cancelled) return;
        setNotConnected(!!data.not_connected);
        setEvents(data.events ?? []);
      })
      .catch(() => {
        if (!cancelled) setEvents([]);
      });
    return () => {
      cancelled = true;
    };
  }, [view, current, refreshKey]);

  function changeView(v: View) {
    setView(v);
    setEvents(null); // show loading while new range fetches
  }

  function changeCurrent(d: Date) {
    setCurrent(d);
    setEvents(null);
  }

  function handleSlotClick(date: string, time: string) {
    setCreateDate(date);
    setCreateTime(time);
    setEditEvent(null);
    setCreateOpen(true);
  }

  function handleEventClick(event: CalendarRangeEvent) {
    setDetailEvent(event);
    setDetailOpen(true);
  }

  function handleEdit(event: CalendarRangeEvent) {
    setEditEvent(event);
    setCreateOpen(true);
  }

  function handleSaved() {
    setRefreshKey((k) => k + 1);
  }

  function handleDeleted() {
    setRefreshKey((k) => k + 1);
  }

  const today = new Date();

  return (
    <>
      {/* ── Toolbar ─────────────────────────────────────────────────────── */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "var(--space-3)",
          padding: "var(--space-3) var(--space-5)",
          borderBottom: "1px solid var(--rule-soft)",
          flexShrink: 0,
          flexWrap: "wrap",
        }}
      >
        {/* Today button */}
        <button
          onClick={() => changeCurrent(new Date())}
          style={{
            ...btnBase,
            padding: "var(--space-2) var(--space-3)",
            fontWeight: 500,
            color: "var(--color-text)",
          }}
        >
          Today
        </button>

        {/* Prev / next */}
        <div style={{ display: "flex", gap: 4 }}>
          <button
            onClick={() => changeCurrent(navigate(view, current, -1))}
            style={btnBase}
            aria-label="Previous"
          >
            <ChevronLeft size={16} />
          </button>
          <button
            onClick={() => changeCurrent(navigate(view, current, 1))}
            style={btnBase}
            aria-label="Next"
          >
            <ChevronRight size={16} />
          </button>
        </div>

        {/* Range label */}
        <span
          style={{
            fontSize: "var(--t-meta)",
            fontWeight: 600,
            color: "var(--color-text)",
            flex: 1,
          }}
        >
          {headerLabel(view, current)}
        </span>

        {/* View toggle */}
        <div
          style={{
            display: "flex",
            border: "1px solid var(--color-border)",
            borderRadius: "var(--r-2)",
            overflow: "hidden",
          }}
        >
          {(["day", "week", "month"] as View[]).map((v) => (
            <button
              key={v}
              onClick={() => changeView(v)}
              style={{
                background: view === v ? "var(--accent-soft)" : "transparent",
                border: "none",
                borderLeft: v === "day" ? "none" : "1px solid var(--color-border)",
                color: view === v ? "var(--accent)" : "var(--color-text-muted)",
                cursor: "pointer",
                fontSize: "var(--t-meta)",
                fontWeight: view === v ? 600 : 400,
                padding: "var(--space-2) var(--space-3)",
                textTransform: "capitalize",
              }}
            >
              {v}
            </button>
          ))}
        </div>

        {/* Add event */}
        <button
          onClick={() => {
            setCreateDate(isoDate(today));
            setCreateTime("09:00");
            setEditEvent(null);
            setCreateOpen(true);
          }}
          style={{
            ...btnBase,
            background: "var(--accent)",
            border: "none",
            color: "var(--color-text-on-cta)",
            fontWeight: 500,
            padding: "var(--space-2) var(--space-3)",
          }}
        >
          + Event
        </button>
      </div>

      {/* ── Not connected banner ─────────────────────────────────────────── */}
      {notConnected && (
        <div
          style={{
            padding: "var(--space-3) var(--space-5)",
            borderBottom: "1px solid var(--rule-soft)",
            fontSize: "var(--t-meta)",
            color: "var(--color-text-muted)",
            background: "var(--warning-subtle)",
          }}
        >
          Google Calendar is not connected. Connect it in{" "}
          <a href="/settings" style={{ color: "var(--accent)", textDecoration: "underline" }}>
            Settings
          </a>
          .
        </div>
      )}

      {/* ── Loading skeleton ─────────────────────────────────────────────── */}
      {events === null && (
        <div
          style={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "var(--color-text-faint)",
            fontSize: "var(--t-meta)",
          }}
        >
          Loading…
        </div>
      )}

      {/* ── Calendar view ────────────────────────────────────────────────── */}
      {events !== null && (view === "week" || view === "day") && (
        <WeekView
          events={events}
          currentDate={current}
          view={view}
          onSlotClick={handleSlotClick}
          onEventClick={handleEventClick}
        />
      )}

      {events !== null && view === "month" && (
        <MonthView
          events={events}
          currentDate={current}
          onSlotClick={handleSlotClick}
          onEventClick={handleEventClick}
        />
      )}

      {/* ── Modals ───────────────────────────────────────────────────────── */}
      <EventModal
        key={editEvent ? `edit-${editEvent.eventId}` : `create-${createDate}-${createTime}`}
        open={createOpen}
        onOpenChange={setCreateOpen}
        initialDate={createDate}
        initialTime={createTime}
        editEvent={editEvent}
        onSaved={handleSaved}
      />

      <EventDetailDialog
        event={detailEvent}
        open={detailOpen}
        onOpenChange={setDetailOpen}
        onEdit={handleEdit}
        onDeleted={handleDeleted}
      />
    </>
  );
}
