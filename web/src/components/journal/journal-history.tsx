"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import type { JournalEntry } from "@/lib/types";

const PROMPT_LABELS: Record<string, string> = {
  best_moment:    "Best moment",
  challenge:      "Challenge",
  small_gratitude:"Small gratitude",
  energy_check:   "Energy & drain",
  tomorrow_focus: "Tomorrow's focus",
};

interface Props {
  entries: JournalEntry[];
}

export default function JournalHistory({ entries }: Props) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  if (entries.length === 0) {
    return (
      <p style={{ fontSize: 14, color: "var(--color-text-faint)" }}>No past entries yet.</p>
    );
  }

  return (
    <div className="space-y-2">
      {entries.map((entry) => {
        const isOpen = expanded.has(entry.id);
        const date   = new Date(entry.date + "T00:00:00");
        const dateLabel = date.toLocaleDateString("en-US", {
          weekday: "short",
          month:   "short",
          day:     "numeric",
        });

        // Preview: first filled reflect response or first line of free write
        const preview =
          entry.responses.best_moment?.trim() ??
          entry.responses.challenge?.trim() ??
          entry.free_write?.trim() ??
          "";

        const filledPrompts = Object.entries(entry.responses).filter(([, v]) => v?.trim());
        const hasFreeWrite  = !!entry.free_write?.trim();

        return (
          <div
            key={entry.id}
            className="rounded-xl overflow-hidden"
            style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)" }}
          >
            {/* Accordion header */}
            <button
              className="w-full flex items-center gap-3 px-4 py-3 text-left"
              onClick={() => toggle(entry.id)}
            >
              <span style={{ color: "var(--color-text-muted)", flexShrink: 0 }}>
                {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              </span>

              <span
                className="text-xs font-medium flex-shrink-0"
                style={{ color: "var(--color-text-muted)", minWidth: 88 }}
              >
                {dateLabel}
              </span>

              {!isOpen && (
                <span
                  className="text-sm truncate"
                  style={{ color: "var(--color-text-faint)" }}
                >
                  {preview
                    ? preview.slice(0, 80) + (preview.length > 80 ? "…" : "")
                    : "No responses"}
                </span>
              )}
            </button>

            {/* Expanded body */}
            {isOpen && (
              <div
                className="px-4 pb-4 space-y-4"
                style={{ borderTop: "1px solid var(--color-border)" }}
              >
                {filledPrompts.map(([slug, value]) => (
                  <div key={slug} className="pt-4">
                    <p className="text-xs mb-1" style={{ color: "var(--color-text-muted)" }}>
                      {PROMPT_LABELS[slug] ?? slug}
                    </p>
                    <p className="text-sm leading-relaxed" style={{ color: "var(--color-text)" }}>
                      {value}
                    </p>
                  </div>
                ))}

                {hasFreeWrite && (
                  <div
                    className="pt-4"
                    style={{ borderTop: "1px solid var(--color-border)" }}
                  >
                    <p className="text-xs mb-1" style={{ color: "var(--color-text-muted)" }}>
                      Free write
                    </p>
                    <p
                      className="text-sm leading-relaxed whitespace-pre-wrap"
                      style={{ color: "var(--color-text)" }}
                    >
                      {entry.free_write}
                    </p>
                  </div>
                )}

                {filledPrompts.length === 0 && !hasFreeWrite && (
                  <p className="pt-4 text-sm" style={{ color: "var(--color-text-faint)" }}>
                    No responses recorded.
                  </p>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
