"use client";

import { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { X, MapPin, Calendar, Clock, Edit2, Trash2 } from "lucide-react";
import type { CalendarRangeEvent } from "@/lib/calendar-types";

interface EventDetailDialogProps {
  event: CalendarRangeEvent | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEdit: (event: CalendarRangeEvent) => void;
  onDeleted: () => void;
}

function formatDateTime(event: CalendarRangeEvent): string {
  if (event.allDay) {
    return new Date(event.start + "T12:00:00").toLocaleDateString("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
    });
  }
  const start = new Date(event.start);
  const end = new Date(event.end);
  const datePart = start.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
  const startTime = start.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
  const endTime = end.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
  return `${datePart} · ${startTime} – ${endTime}`;
}

const TYPE_LABEL: Record<string, string> = {
  primary: "Primary",
  birthday: "Birthday",
  holiday: "Holiday",
  other: "Other",
};

export default function EventDetailDialog({
  event,
  open,
  onOpenChange,
  onEdit,
  onDeleted,
}: EventDetailDialogProps) {
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  if (!event) return null;

  async function handleDelete() {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    setDeleting(true);
    try {
      await fetch(`/api/google/calendar/events/${event!.eventId}`, { method: "DELETE" });
      onDeleted();
      onOpenChange(false);
    } catch {
      // silently reset — user can retry
    } finally {
      setDeleting(false);
      setConfirmDelete(false);
    }
  }

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(v) => {
        if (!v) setConfirmDelete(false);
        onOpenChange(v);
      }}
    >
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
            width: "min(400px, 92vw)",
            boxSizing: "border-box",
            overflow: "hidden",
          }}
          aria-describedby={undefined}
        >
          {/* Header */}
          <div
            style={{
              display: "flex",
              alignItems: "flex-start",
              justifyContent: "space-between",
              padding: "var(--space-4) var(--space-4) var(--space-3)",
              borderBottom: "1px solid var(--rule-soft)",
            }}
          >
            <Dialog.Title
              style={{
                color: "var(--color-text)",
                fontSize: "var(--t-meta)",
                fontWeight: 600,
                flex: 1,
                paddingRight: "var(--space-3)",
                lineHeight: 1.4,
              }}
            >
              {event.title}
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
                flexShrink: 0,
              }}
            >
              <X size={16} />
            </Dialog.Close>
          </div>

          {/* Body */}
          <div style={{ padding: "var(--space-4)", display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
            {/* Date/time */}
            <div style={{ display: "flex", alignItems: "flex-start", gap: "var(--space-2)" }}>
              {event.allDay ? (
                <Calendar size={14} style={{ color: "var(--color-text-faint)", marginTop: 2, flexShrink: 0 }} />
              ) : (
                <Clock size={14} style={{ color: "var(--color-text-faint)", marginTop: 2, flexShrink: 0 }} />
              )}
              <span style={{ fontSize: "var(--t-meta)", color: "var(--color-text-muted)" }}>
                {formatDateTime(event)}
              </span>
            </div>

            {/* Location */}
            {event.location && (
              <div style={{ display: "flex", alignItems: "flex-start", gap: "var(--space-2)" }}>
                <MapPin size={14} style={{ color: "var(--color-text-faint)", marginTop: 2, flexShrink: 0 }} />
                <span style={{ fontSize: "var(--t-meta)", color: "var(--color-text-muted)" }}>
                  {event.location}
                </span>
              </div>
            )}

            {/* Calendar label */}
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "var(--space-1)",
                fontSize: "var(--t-micro)",
                color: "var(--color-text-faint)",
              }}
            >
              <span>{event.calendarName}</span>
              {event.calendarType !== "primary" && (
                <>
                  <span>·</span>
                  <span>{TYPE_LABEL[event.calendarType] ?? event.calendarType}</span>
                </>
              )}
            </div>
          </div>

          {/* Actions */}
          <div
            style={{
              display: "flex",
              gap: "var(--space-2)",
              padding: "var(--space-3) var(--space-4) var(--space-4)",
              borderTop: "1px solid var(--rule-soft)",
            }}
          >
            <button
              onClick={() => {
                onOpenChange(false);
                onEdit(event);
              }}
              style={{
                flex: 1,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "var(--space-2)",
                background: "var(--color-surface-raised)",
                border: "1px solid var(--color-border)",
                borderRadius: "var(--r-2)",
                color: "var(--color-text)",
                fontSize: "var(--t-meta)",
                padding: "var(--space-2)",
                cursor: "pointer",
              }}
            >
              <Edit2 size={14} />
              Edit
            </button>
            <button
              onClick={handleDelete}
              disabled={deleting}
              style={{
                flex: 1,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "var(--space-2)",
                background: confirmDelete ? "oklch(30% 0.08 25 / 0.5)" : "var(--color-surface-raised)",
                border: `1px solid ${confirmDelete ? "oklch(55% 0.18 25)" : "var(--color-border)"}`,
                borderRadius: "var(--r-2)",
                color: confirmDelete ? "oklch(75% 0.15 25)" : "var(--color-text-muted)",
                fontSize: "var(--t-meta)",
                padding: "var(--space-2)",
                cursor: deleting ? "default" : "pointer",
                opacity: deleting ? 0.6 : 1,
                transition: "background 0.15s, border-color 0.15s, color 0.15s",
              }}
            >
              <Trash2 size={14} />
              {deleting ? "Deleting…" : confirmDelete ? "Confirm?" : "Delete"}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
