"use client";

import { useState } from "react";

import { NOTE_CLAMP_LINES, shouldClampNote } from "@/lib/note-clamp";

/**
 * A long free-text note, clamped on first paint with a tap to open it.
 *
 * WHY THIS EXISTS
 *
 * Notes on plans, sessions and inventory rows are written long on purpose: they carry the
 * reasoning behind a decision so a later session can read it back instead of re-deriving it,
 * and truncating them in the DATABASE would throw that away. But the same paragraph rendered
 * in full on a phone buries the thing the screen is actually for — mid-workout, a 90-word
 * rationale pushes the set logger off the viewport.
 *
 * So the note stays whole in the database and is clamped in the UI. Two lines is about one
 * phone line of context, enough to recognise the note and decide whether to open it.
 */

export function CollapsibleNote({
  text,
  style,
  label = "note",
}: {
  text: string;
  style?: React.CSSProperties;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const clampable = shouldClampNote(text);

  const clamped: React.CSSProperties =
    clampable && !open
      ? {
          display: "-webkit-box",
          WebkitLineClamp: NOTE_CLAMP_LINES,
          WebkitBoxOrient: "vertical",
          overflow: "hidden",
        }
      : {};

  return (
    <div style={{ marginTop: "var(--space-2)" }}>
      <p
        style={{
          fontSize: "var(--t-micro)",
          color: "var(--color-text-muted)",
          fontStyle: "italic",
          overflowWrap: "break-word",
          ...style,
          ...clamped,
        }}
      >
        {text}
      </p>
      {clampable && (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          style={{
            marginTop: 2,
            padding: 0,
            background: "none",
            border: "none",
            cursor: "pointer",
            fontSize: "var(--t-micro)",
            color: "var(--color-text-faint)",
            textDecoration: "underline",
          }}
        >
          {open ? `Hide ${label}` : `Show full ${label}`}
        </button>
      )}
    </div>
  );
}
