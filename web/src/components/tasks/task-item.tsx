"use client";

import { useState, useTransition, useRef, useEffect } from "react";
import { Archive } from "lucide-react";
import type { Task } from "@/lib/types";

const PRIORITY_COLOR: Record<string, string> = {
  high:   "var(--color-danger)",
  medium: "var(--color-warning)",
  low:    "var(--color-text-faint)",
};

function relativeDue(dateStr: string): { label: string; urgent: boolean } {
  const diff = Math.round(
    (new Date(dateStr + "T00:00:00").getTime() - Date.now()) / 86_400_000
  );
  if (diff < 0)  return { label: `${Math.abs(diff)}d overdue`, urgent: true };
  if (diff === 0) return { label: "Today",    urgent: true  };
  if (diff === 1) return { label: "Tomorrow", urgent: false };
  if (diff <= 7)  return { label: `${diff}d`, urgent: false };
  return { label: dateStr.slice(5).replace("-", "/"), urgent: false };
}

interface Props {
  task: Task;
  completeAction: (id: string) => Promise<{ error?: string }>;
  archiveAction:  (id: string) => Promise<{ error?: string }>;
  updateAction:   (id: string, title: string) => Promise<{ error?: string }>;
}

export default function TaskItem({ task, completeAction, archiveAction, updateAction }: Props) {
  const [isPending, startTransition] = useTransition();
  const [editing, setEditing]       = useState(false);
  const [editTitle, setEditTitle]   = useState(task.title);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  const dot = PRIORITY_COLOR[task.priority ?? "low"] ?? PRIORITY_COLOR.low;
  const due = task.due_date ? relativeDue(task.due_date) : null;

  function handleComplete() {
    startTransition(async () => { await completeAction(task.id); });
  }

  function handleArchive() {
    startTransition(async () => { await archiveAction(task.id); });
  }

  function commitEdit() {
    setEditing(false);
    const trimmed = editTitle.trim();
    if (trimmed && trimmed !== task.title) {
      startTransition(async () => { await updateAction(task.id, trimmed); });
    } else {
      setEditTitle(task.title);
    }
  }

  return (
    <div
      className="flex items-center gap-3 px-4 py-3"
      style={{ opacity: isPending ? 0.4 : 1, transition: "opacity 150ms" }}
    >
      {/* Completion circle — 44px touch target wrapping 18px visual */}
      <button
        onClick={handleComplete}
        disabled={isPending}
        className="flex-shrink-0 flex items-center justify-center transition-opacity hover:opacity-70"
        style={{ width: 44, height: 44, margin: "-13px -10px -13px -13px" }}
        title="Mark complete"
      >
        <span
          className="rounded-full border-2 block"
          style={{ width: 18, height: 18, borderColor: dot }}
        />
      </button>

      {/* Priority dot */}
      <span
        className="flex-shrink-0 rounded-full"
        style={{ width: 6, height: 6, background: dot }}
      />

      {/* Title */}
      <div className="flex-1 min-w-0">
        {editing ? (
          <input
            ref={inputRef}
            value={editTitle}
            onChange={(e) => setEditTitle(e.target.value)}
            onBlur={commitEdit}
            onKeyDown={(e) => {
              if (e.key === "Enter")  commitEdit();
              if (e.key === "Escape") { setEditTitle(task.title); setEditing(false); }
            }}
            className="w-full bg-transparent text-sm focus:outline-none"
            style={{ color: "var(--color-text)" }}
          />
        ) : (
          <span
            className="text-sm cursor-text"
            style={{ color: "var(--color-text)" }}
            onClick={() => setEditing(true)}
          >
            {task.title}
          </span>
        )}
        {task.category && (
          <span className="text-xs ml-1.5" style={{ color: "var(--color-text-faint)" }}>
            {task.category}
          </span>
        )}
      </div>

      {/* Due date */}
      {due && (
        <span
          className="flex-shrink-0 text-xs tabular-nums"
          style={{ color: due.urgent ? "var(--color-danger)" : "var(--color-text-muted)" }}
        >
          {due.label}
        </span>
      )}

      {/* Archive */}
      <button
        onClick={handleArchive}
        disabled={isPending}
        className="flex-shrink-0 p-1 rounded transition-opacity hover:opacity-70"
        style={{ color: "var(--color-text-muted)" }}
        title="Archive"
      >
        <Archive size={13} />
      </button>
    </div>
  );
}
