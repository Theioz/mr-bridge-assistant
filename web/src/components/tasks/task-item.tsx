"use client";

import { useState, useTransition, useRef, useEffect } from "react";
import { Archive, ChevronDown, ChevronRight, Pencil, X } from "lucide-react";
import type { Task, Subtask } from "@/lib/types";

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
  completeAction:       (id: string) => Promise<{ error?: string }>;
  archiveAction:        (id: string) => Promise<{ error?: string }>;
  updateAction:         (id: string, fields: { title?: string; due_date?: string | null; priority?: string | null }) => Promise<{ error?: string }>;
  addSubtaskAction:     (parentId: string, title: string) => Promise<{ error?: string }>;
  completeSubtaskAction:(id: string) => Promise<{ error?: string }>;
  deleteSubtaskAction:  (id: string) => Promise<{ error?: string }>;
}

function SubtaskRow({
  subtask,
  completeSubtaskAction,
  deleteSubtaskAction,
  updateAction,
}: {
  subtask: Subtask;
  completeSubtaskAction: (id: string) => Promise<{ error?: string }>;
  deleteSubtaskAction:   (id: string) => Promise<{ error?: string }>;
  updateAction:          (id: string, fields: { title?: string; due_date?: string | null; priority?: string | null }) => Promise<{ error?: string }>;
}) {
  const [isPending, startTransition] = useTransition();
  const [editing, setEditing]       = useState(false);
  const [editTitle, setEditTitle]   = useState(subtask.title);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  function commitEdit() {
    setEditing(false);
    const trimmed = editTitle.trim();
    if (trimmed && trimmed !== subtask.title) {
      startTransition(async () => { await updateAction(subtask.id, { title: trimmed }); });
    } else {
      setEditTitle(subtask.title);
    }
  }

  const done = subtask.status === "completed";

  return (
    <div
      className="flex items-center gap-2 px-3 py-2"
      style={{
        opacity: isPending ? 0.4 : 1,
        transition: "opacity 150ms",
        borderLeft: "2px solid var(--color-border)",
        marginLeft: 8,
      }}
    >
      {/* Checkbox */}
      <button
        onClick={() => !done && startTransition(async () => { await completeSubtaskAction(subtask.id); })}
        disabled={isPending || done}
        className="flex-shrink-0 flex items-center justify-center transition-opacity hover:opacity-70"
        style={{ width: 32, height: 32, margin: "-8px -4px -8px -8px" }}
        title={done ? "Completed" : "Mark complete"}
      >
        <span
          className="rounded-sm border-2 block flex items-center justify-center"
          style={{
            width: 15,
            height: 15,
            borderColor: done ? "var(--color-text-faint)" : "var(--color-border)",
            background: done ? "var(--color-text-faint)" : "transparent",
          }}
        />
      </button>

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
              if (e.key === "Escape") { setEditTitle(subtask.title); setEditing(false); }
            }}
            className="w-full bg-transparent text-sm focus:outline-none"
            style={{ color: "var(--color-text)" }}
          />
        ) : (
          <span
            className="text-sm cursor-text"
            style={{
              color: done ? "var(--color-text-faint)" : "var(--color-text)",
              textDecoration: done ? "line-through" : "none",
            }}
            onClick={() => !done && setEditing(true)}
          >
            {subtask.title}
          </span>
        )}
      </div>

      {/* Delete */}
      {!done && (
        <button
          onClick={() => startTransition(async () => { await deleteSubtaskAction(subtask.id); })}
          disabled={isPending}
          className="flex-shrink-0 p-1 rounded transition-opacity hover:opacity-70"
          style={{ color: "var(--color-text-faint)" }}
          title="Remove"
        >
          <X size={12} />
        </button>
      )}
    </div>
  );
}

export default function TaskItem({
  task,
  completeAction,
  archiveAction,
  updateAction,
  addSubtaskAction,
  completeSubtaskAction,
  deleteSubtaskAction,
}: Props) {
  const [isPending, startTransition] = useTransition();
  const [editing, setEditing]       = useState(false);
  const [editTitle, setEditTitle]   = useState(task.title);
  const inputRef = useRef<HTMLInputElement>(null);

  const subtasks = task.subtasks ?? [];
  const defaultExpanded = subtasks.length <= 3;
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [addInput, setAddInput] = useState("");
  const addInputRef = useRef<HTMLInputElement>(null);

  const [showEditPanel, setShowEditPanel] = useState(false);
  const [editDueDate, setEditDueDate]     = useState(task.due_date ?? "");
  const [editPriority, setEditPriority]   = useState<"high" | "medium" | "low">((task.priority as "high" | "medium" | "low") ?? "medium");

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  const dot = PRIORITY_COLOR[task.priority ?? "low"] ?? PRIORITY_COLOR.low;
  const due = task.due_date ? relativeDue(task.due_date) : null;

  const completedCount = subtasks.filter((s) => s.status === "completed").length;
  const totalCount = subtasks.length;
  const allDone = totalCount > 0 && completedCount === totalCount;

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
      startTransition(async () => { await updateAction(task.id, { title: trimmed }); });
    } else {
      setEditTitle(task.title);
    }
  }

  function handleAddSubtask(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key !== "Enter") return;
    const trimmed = addInput.trim();
    if (!trimmed) return;
    setAddInput("");
    startTransition(async () => {
      await addSubtaskAction(task.id, trimmed);
    });
    // Keep focus for rapid entry
    setTimeout(() => addInputRef.current?.focus(), 50);
  }

  return (
    <div style={{ opacity: isPending ? 0.4 : 1, transition: "opacity 150ms" }}>
      {/* Parent row */}
      <div className="flex items-center gap-3 px-4 py-3">
        {/* Completion circle — 44px touch target */}
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

        {/* Title + subtask progress */}
        <div className="flex-1 min-w-0 flex items-center gap-2">
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
              className="flex-1 bg-transparent text-sm focus:outline-none"
              style={{ color: "var(--color-text)" }}
            />
          ) : (
            <span
              className="text-sm cursor-text truncate"
              style={{ color: "var(--color-text)" }}
              onClick={() => setEditing(true)}
            >
              {task.title}
            </span>
          )}
          {task.category && (
            <span className="text-xs flex-shrink-0" style={{ color: "var(--color-text-faint)" }}>
              {task.category}
            </span>
          )}
          {totalCount > 0 && (
            <span
              className="text-xs tabular-nums flex-shrink-0 font-medium"
              style={{ color: allDone ? "#10B981" : "var(--color-text-muted)" }}
            >
              {completedCount}/{totalCount}
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

        {/* Expand/collapse chevron (only when subtasks exist) */}
        {totalCount > 0 && (
          <button
            onClick={() => setExpanded((v) => !v)}
            className="flex-shrink-0 p-1 rounded transition-opacity hover:opacity-70"
            style={{ color: "var(--color-text-muted)" }}
            title={expanded ? "Collapse" : "Expand"}
          >
            {expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
          </button>
        )}

        {/* Edit due date / priority */}
        <button
          onClick={() => setShowEditPanel((v) => !v)}
          className="flex-shrink-0 p-1 rounded transition-opacity hover:opacity-70"
          style={{ color: "var(--color-text-muted)" }}
          title="Edit due date / priority"
        >
          <Pencil size={13} />
        </button>

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

      {/* Due date / priority edit panel */}
      {showEditPanel && (
        <div className="flex items-center gap-3 px-4 pb-3" style={{ marginLeft: 36 }}>
          {/* Due date */}
          <input
            type="date"
            value={editDueDate}
            onChange={(e) => setEditDueDate(e.target.value)}
            className="text-xs rounded-lg px-2 py-1 focus:outline-none"
            style={{
              background: "var(--color-surface)",
              border: "1px solid var(--color-border)",
              color: "var(--color-text)",
            }}
          />
          {/* Clear due date */}
          {editDueDate && (
            <button onClick={() => setEditDueDate("")} style={{ color: "var(--color-text-faint)" }}>
              <X size={12} />
            </button>
          )}
          {/* Priority */}
          <select
            value={editPriority}
            onChange={(e) => setEditPriority(e.target.value as "high" | "medium" | "low")}
            className="text-xs rounded-lg px-2 py-1 focus:outline-none"
            style={{
              background: "var(--color-surface)",
              border: "1px solid var(--color-border)",
              color: "var(--color-text)",
            }}
          >
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
          {/* Save */}
          <button
            onClick={() => {
              setShowEditPanel(false);
              startTransition(async () => {
                await updateAction(task.id, {
                  due_date: editDueDate || null,
                  priority: editPriority || null,
                });
              });
            }}
            className="text-xs px-2 py-1 rounded-lg"
            style={{ background: "var(--color-primary)", color: "white" }}
          >
            Save
          </button>
          <button onClick={() => setShowEditPanel(false)} style={{ color: "var(--color-text-faint)" }}>
            <X size={12} />
          </button>
        </div>
      )}

      {/* Subtask list + add input */}
      {expanded && (
        <div className="pb-2 px-4 space-y-0.5">
          {subtasks.map((sub) => (
            <SubtaskRow
              key={sub.id}
              subtask={sub}
              completeSubtaskAction={completeSubtaskAction}
              deleteSubtaskAction={deleteSubtaskAction}
              updateAction={updateAction}
            />
          ))}

          {/* Add item input */}
          <div
            className="flex items-center gap-2 px-3 py-1.5"
            style={{ borderLeft: "2px solid var(--color-border)", marginLeft: 8 }}
          >
            <input
              ref={addInputRef}
              value={addInput}
              onChange={(e) => setAddInput(e.target.value)}
              onKeyDown={handleAddSubtask}
              placeholder="Add item…"
              className="flex-1 bg-transparent text-sm focus:outline-none"
              style={{ color: "var(--color-text)", caretColor: "var(--color-primary)" }}
            />
          </div>
        </div>
      )}

      {/* Show add input even when no subtasks yet (collapsed = no subtasks, so always show) */}
      {!expanded && totalCount === 0 && (
        <div className="pb-2 px-4">
          <div
            className="flex items-center gap-2 px-3 py-1.5"
            style={{ borderLeft: "2px solid var(--color-border)", marginLeft: 8 }}
          >
            <input
              ref={addInputRef}
              value={addInput}
              onChange={(e) => setAddInput(e.target.value)}
              onKeyDown={handleAddSubtask}
              placeholder="Add item…"
              className="flex-1 bg-transparent text-sm focus:outline-none"
              style={{ color: "var(--color-text)", caretColor: "var(--color-primary)" }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
