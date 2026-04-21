"use client";

import { useState, useEffect, type FormEvent } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import type { CalendarRangeEvent } from "@/lib/calendar-types";

interface EventModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialDate?: string;
  initialTime?: string;
  editEvent?: CalendarRangeEvent | null;
  onSaved: () => void;
}

const labelStyle = {
  display: "block",
  fontSize: "var(--t-micro)",
  fontWeight: 500,
  color: "var(--color-text-muted)",
  marginBottom: 4,
  textTransform: "uppercase" as const,
  letterSpacing: "0.06em",
};

const inputStyle = {
  width: "100%",
  background: "var(--color-surface-raised)",
  border: "1px solid var(--color-border)",
  borderRadius: "var(--r-2)",
  color: "var(--color-text)",
  fontSize: "var(--t-meta)",
  padding: "var(--space-2) var(--space-3)",
  outline: "none",
  boxSizing: "border-box" as const,
};

export default function EventModal({
  open,
  onOpenChange,
  initialDate,
  initialTime,
  editEvent,
  onSaved,
}: EventModalProps) {
  const isEdit = !!editEvent;

  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [location, setLocation] = useState("");
  const [allDay, setAllDay] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Pre-fill when opening
  useEffect(() => {
    if (!open) return;
    if (editEvent) {
      setTitle(editEvent.title);
      setDate(editEvent.start.slice(0, 10));
      setAllDay(editEvent.allDay);
      if (!editEvent.allDay) {
        setStartTime(editEvent.start.slice(11, 16));
        setEndTime(editEvent.end.slice(11, 16));
      } else {
        setStartTime("");
        setEndTime("");
      }
      setLocation(editEvent.location ?? "");
    } else {
      setTitle("");
      setDate(initialDate ?? new Date().toISOString().slice(0, 10));
      setAllDay(false);
      setStartTime(initialTime ?? "09:00");
      const [h, m] = (initialTime ?? "09:00").split(":").map(Number);
      setEndTime(`${String((h + 1) % 24).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
      setLocation("");
    }
    setError("");
  }, [open, editEvent, initialDate, initialTime]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!title.trim()) return setError("Title is required.");
    setSaving(true);
    setError("");
    try {
      const body = { title: title.trim(), date, start_time: allDay ? undefined : startTime, end_time: allDay ? undefined : endTime, location: location.trim() || undefined, all_day: allDay };

      let res: Response;
      if (isEdit) {
        res = await fetch(`/api/google/calendar/events/${editEvent!.eventId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
      } else {
        res = await fetch("/api/google/calendar/events", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
      }

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Request failed");
      }

      onSaved();
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay
          style={{
            position: "fixed",
            inset: 0,
            background: "var(--overlay-scrim)",
            zIndex: 100,
          }}
        />
        <Dialog.Content
          style={{
            position: "fixed",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            zIndex: 101,
            background: "var(--color-surface)",
            border: "1px solid var(--color-border)",
            borderRadius: "var(--r-2)",
            width: "min(480px, 92vw)",
            padding: "var(--space-5)",
            boxSizing: "border-box",
          }}
          aria-describedby={undefined}
        >
          <div className="flex items-center justify-between" style={{ marginBottom: "var(--space-4)" }}>
            <Dialog.Title style={{ color: "var(--color-text)", fontSize: "var(--t-meta)", fontWeight: 600 }}>
              {isEdit ? "Edit event" : "New event"}
            </Dialog.Title>
            <Dialog.Close
              style={{
                background: "transparent",
                border: "none",
                color: "var(--color-text-muted)",
                cursor: "pointer",
                padding: 4,
                borderRadius: 4,
                display: "flex",
              }}
            >
              <X size={16} />
            </Dialog.Close>
          </div>

          <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
            {/* Title */}
            <div>
              <label style={labelStyle}>Title</label>
              <input
                style={inputStyle}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Event title"
                autoFocus
                required
              />
            </div>

            {/* Date + All-day */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: "var(--space-3)", alignItems: "end" }}>
              <div>
                <label style={labelStyle}>Date</label>
                <input style={inputStyle} type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
              </div>
              <label
                style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", cursor: "pointer", paddingBottom: "var(--space-2)", fontSize: "var(--t-meta)", color: "var(--color-text-muted)", whiteSpace: "nowrap" }}
              >
                <input type="checkbox" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} />
                All day
              </label>
            </div>

            {/* Times */}
            {!allDay && (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--space-3)" }}>
                <div>
                  <label style={labelStyle}>Start</label>
                  <input style={inputStyle} type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
                </div>
                <div>
                  <label style={labelStyle}>End</label>
                  <input style={inputStyle} type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
                </div>
              </div>
            )}

            {/* Location */}
            <div>
              <label style={labelStyle}>Location</label>
              <input style={inputStyle} value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Optional" />
            </div>

            {error && (
              <p style={{ fontSize: "var(--t-micro)", color: "oklch(65% 0.18 25)", margin: 0 }}>{error}</p>
            )}

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "var(--space-2)", marginTop: "var(--space-1)" }}>
              <Dialog.Close
                style={{
                  background: "transparent",
                  border: "1px solid var(--color-border)",
                  borderRadius: "var(--r-2)",
                  color: "var(--color-text-muted)",
                  fontSize: "var(--t-meta)",
                  padding: "var(--space-2) var(--space-4)",
                  cursor: "pointer",
                }}
              >
                Cancel
              </Dialog.Close>
              <button
                type="submit"
                disabled={saving}
                style={{
                  background: "var(--accent)",
                  border: "none",
                  borderRadius: "var(--r-2)",
                  color: "var(--color-text-on-cta)",
                  fontSize: "var(--t-meta)",
                  fontWeight: 500,
                  padding: "var(--space-2) var(--space-4)",
                  cursor: saving ? "default" : "pointer",
                  opacity: saving ? 0.6 : 1,
                }}
              >
                {saving ? "Saving…" : isEdit ? "Save changes" : "Create"}
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
