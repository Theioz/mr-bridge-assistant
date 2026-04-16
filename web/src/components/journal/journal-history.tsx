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
  today?: string;
  onEdit?: (entry: JournalEntry) => void;
}

export default function JournalHistory({ entries, today, onEdit }: Props) {
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
      <p style={{ fontSize: "var(--t-body)", color: "var(--color-text-faint)" }}>
        No entries yet.
      </p>
    );
  }

  return (
    <div>
      {entries.map((entry, i) => {
        const isOpen    = expanded.has(entry.id);
        const isToday   = today && entry.date === today;
        const date      = new Date(entry.date + "T00:00:00");
        const dateLabel = date.toLocaleDateString("en-US", {
          weekday: "short",
          month:   "short",
          day:     "numeric",
        });
        const yearLabel = date.toLocaleDateString("en-US", { year: "numeric" });

        // Preview: first filled reflect response or first line of free write
        const preview =
          entry.responses.best_moment?.trim() ??
          entry.responses.challenge?.trim() ??
          entry.free_write?.trim() ??
          "";

        const filledPrompts = Object.entries(entry.responses).filter(([, v]) => v?.trim());
        const hasFreeWrite  = !!entry.free_write?.trim();

        return (
          <article
            key={entry.id}
            style={{
              borderTop: i > 0 ? "1px solid var(--rule-soft)" : "none",
            }}
          >
            {/* Entry header — hairline row with tabular timestamp + preview */}
            <div style={{ display: "flex", alignItems: "stretch" }}>
              <button
                onClick={() => toggle(entry.id)}
                aria-expanded={isOpen}
                className="hover-text-brighten transition-colors"
                style={{
                  flex: 1,
                  minHeight: 44,
                  display: "flex",
                  alignItems: "baseline",
                  gap: "var(--space-3)",
                  padding: "var(--space-3) 0",
                  textAlign: "left",
                  background: "transparent",
                  border: "none",
                  cursor: "pointer",
                  color: "var(--color-text-faint)",
                  transitionDuration: "var(--motion-fast)",
                  transitionTimingFunction: "var(--ease-out-quart)",
                }}
              >
                <span
                  aria-hidden
                  style={{
                    flexShrink: 0,
                    display: "inline-flex",
                    alignSelf: "center",
                    color: "var(--color-text-muted)",
                  }}
                >
                  {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                </span>

                <time
                  dateTime={entry.date}
                  className="tnum"
                  style={{
                    flexShrink: 0,
                    minWidth: 96,
                    fontSize: "var(--t-micro)",
                    letterSpacing: "0.04em",
                    color: isToday ? "var(--accent)" : "var(--color-text-muted)",
                    fontWeight: isToday ? 600 : 500,
                  }}
                >
                  {isToday ? "Today" : dateLabel}
                </time>

                {!isOpen && (
                  <span
                    className="truncate"
                    style={{
                      fontSize: "var(--t-meta)",
                      color: "var(--color-text-faint)",
                      lineHeight: 1.5,
                    }}
                  >
                    {preview || "No responses"}
                  </span>
                )}
              </button>

              {onEdit && (
                <button
                  onClick={() => onEdit(entry)}
                  className="hover-text-brighten transition-colors print:hidden"
                  style={{
                    flexShrink: 0,
                    minHeight: 44,
                    padding: "var(--space-3) var(--space-3)",
                    fontSize: "var(--t-micro)",
                    letterSpacing: "0.04em",
                    color: "var(--color-text-faint)",
                    background: "transparent",
                    border: "none",
                    cursor: "pointer",
                    transitionDuration: "var(--motion-fast)",
                    transitionTimingFunction: "var(--ease-out-quart)",
                  }}
                >
                  Edit
                </button>
              )}
            </div>

            {/* Expanded body — reading column, entries as prose */}
            {isOpen && (
              <div
                className="prose-column"
                style={{
                  paddingBottom: "var(--space-6)",
                  paddingLeft: "calc(14px + var(--space-3))",
                  display: "flex",
                  flexDirection: "column",
                  gap: "var(--space-5)",
                }}
              >
                {/* Full date as a small tabular meta line above the entry content */}
                <p
                  className="tnum"
                  style={{
                    fontSize: "var(--t-micro)",
                    color: "var(--color-text-faint)",
                    letterSpacing: "0.04em",
                  }}
                >
                  {date.toLocaleDateString("en-US", {
                    weekday: "long",
                    month: "long",
                    day: "numeric",
                  })}
                  {" · "}
                  {yearLabel}
                </p>

                {filledPrompts.map(([slug, value]) => (
                  <section key={slug}>
                    <h3
                      className="db-section-label"
                      style={{ margin: "0 0 var(--space-2)" }}
                    >
                      {PROMPT_LABELS[slug] ?? slug}
                    </h3>
                    <p
                      style={{
                        fontSize: "var(--t-body)",
                        lineHeight: 1.7,
                        color: "var(--color-text)",
                        whiteSpace: "pre-wrap",
                      }}
                    >
                      {value}
                    </p>
                  </section>
                ))}

                {hasFreeWrite && (
                  <section
                    style={{
                      paddingTop: "var(--space-5)",
                      borderTop: "1px solid var(--rule-soft)",
                    }}
                  >
                    <h3
                      className="db-section-label"
                      style={{ margin: "0 0 var(--space-2)" }}
                    >
                      Free write
                    </h3>
                    <p
                      style={{
                        fontSize: "var(--t-body)",
                        lineHeight: 1.75,
                        color: "var(--color-text)",
                        whiteSpace: "pre-wrap",
                      }}
                    >
                      {entry.free_write}
                    </p>
                  </section>
                )}

                {filledPrompts.length === 0 && !hasFreeWrite && (
                  <p
                    style={{
                      fontSize: "var(--t-body)",
                      color: "var(--color-text-faint)",
                    }}
                  >
                    No responses recorded.
                  </p>
                )}
              </div>
            )}
          </article>
        );
      })}
    </div>
  );
}
