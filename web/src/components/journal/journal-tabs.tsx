"use client";

import { useState } from "react";
import JournalEditor from "./journal-editor";
import JournalHistory from "./journal-history";
import type { JournalEntry, JournalResponses } from "@/lib/types";

type OuterTab = "write" | "history";

interface Props {
  today: string;
  initialResponses: JournalResponses;
  initialFreeWrite: string;
  allEntries: JournalEntry[];
  saveAction: (
    date: string,
    responses: JournalResponses,
    freeWrite: string
  ) => Promise<{ error?: string }>;
}

export default function JournalTabs({
  today,
  initialResponses,
  initialFreeWrite,
  allEntries,
  saveAction,
}: Props) {
  const [tab, setTab]                     = useState<OuterTab>("write");
  const [editingEntry, setEditingEntry]   = useState<JournalEntry | null>(null);

  const isEditingPast = editingEntry !== null;
  const editorDate    = editingEntry?.date ?? today;
  const editorResponses  = editingEntry?.responses  ?? initialResponses;
  const editorFreeWrite  = editingEntry?.free_write ?? initialFreeWrite ?? "";

  function handleEditEntry(entry: JournalEntry) {
    setEditingEntry(entry);
    setTab("write");
  }

  function handleSubmit() {
    setEditingEntry(null);
    setTab("history");
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-6)" }}>
      {/* Outer tab bar — hairline rule with amber underline on active */}
      <div
        role="tablist"
        aria-label="Journal view"
        className="flex print:hidden"
        style={{
          gap: "var(--space-5)",
          borderBottom: "1px solid var(--rule-soft)",
        }}
      >
        {([["write", "Write"], ["history", "History"]] as [OuterTab, string][]).map(
          ([t, label]) => {
            const isActive = tab === t;
            return (
              <button
                key={t}
                role="tab"
                aria-selected={isActive}
                onClick={() => setTab(t)}
                className="transition-colors"
                style={{
                  minHeight: 44,
                  padding: "var(--space-2) var(--space-1)",
                  fontFamily: "var(--font-display), system-ui, sans-serif",
                  fontSize: "var(--t-micro)",
                  fontWeight: 600,
                  letterSpacing: "0.12em",
                  textTransform: "uppercase",
                  color: isActive ? "var(--accent)" : "var(--color-text-faint)",
                  background: "transparent",
                  border: "none",
                  borderBottom: isActive
                    ? "2px solid var(--accent)"
                    : "2px solid transparent",
                  marginBottom: -1,
                  transitionDuration: "var(--motion-fast)",
                  transitionTimingFunction: "var(--ease-out-quart)",
                  cursor: "pointer",
                }}
              >
                {label}
              </button>
            );
          }
        )}
      </div>

      {/* Write tab */}
      {tab === "write" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
          {isEditingPast && (
            <div
              className="flex items-center print:hidden"
              style={{ gap: "var(--space-3)" }}
            >
              <button
                onClick={() => { setEditingEntry(null); }}
                className="hover-text-brighten transition-colors"
                style={{
                  minHeight: 44,
                  display: "inline-flex",
                  alignItems: "center",
                  fontSize: "var(--t-micro)",
                  color: "var(--color-text-muted)",
                  background: "transparent",
                  border: "none",
                  padding: 0,
                  cursor: "pointer",
                  transitionDuration: "var(--motion-fast)",
                  transitionTimingFunction: "var(--ease-out-quart)",
                }}
              >
                ← Back to today
              </button>
              <span
                className="tnum"
                style={{ fontSize: "var(--t-micro)", color: "var(--color-text-faint)" }}
              >
                Editing{" "}
                {new Date(editingEntry.date + "T00:00:00").toLocaleDateString("en-US", {
                  weekday: "long", month: "long", day: "numeric",
                })}
              </span>
            </div>
          )}
          <JournalEditor
            key={editingEntry?.id ?? "today"}
            date={editorDate}
            initialResponses={editorResponses}
            initialFreeWrite={editorFreeWrite}
            saveAction={saveAction}
            onSubmit={handleSubmit}
          />
        </div>
      )}

      {/* History tab */}
      {tab === "history" && (
        <JournalHistory
          entries={allEntries}
          today={today}
          onEdit={handleEditEntry}
        />
      )}
    </div>
  );
}
