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
    <div className="space-y-6">
      {/* Outer tab bar */}
      <div
        className="flex gap-1 p-1 rounded-xl self-start"
        style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)", display: "inline-flex" }}
      >
        {([["write", "Write"], ["history", "History"]] as [OuterTab, string][]).map(([t, label]) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className="px-4 py-1.5 rounded-lg text-sm font-medium transition-colors"
            style={{
              background: tab === t ? "var(--color-primary)"     : "transparent",
              color:      tab === t ? "var(--color-text-on-cta)" : "var(--color-text-muted)",
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Write tab */}
      {tab === "write" && (
        <div className="space-y-3">
          {isEditingPast && (
            <div className="flex items-center gap-3">
              <button
                onClick={() => { setEditingEntry(null); }}
                className="text-xs"
                style={{ color: "var(--color-text-muted)" }}
              >
                ← Back to today
              </button>
              <span className="text-xs" style={{ color: "var(--color-text-faint)" }}>
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
