"use client";

import { useState, useTransition, useRef, useEffect } from "react";
import { Archive, ChevronDown, ChevronRight, Pencil, X } from "lucide-react";
import type { Task, Subtask } from "@/lib/types";
import { todayString } from "@/lib/timezone";

function relativeDue(dateStr: string): { label: string; urgent: boolean } {
  const today = todayString();
  const diff = Math.round(
    (new Date(dateStr + "T00:00:00").getTime() - new Date(today + "T00:00:00").getTime()) / 86_400_000
  );
  if (diff < 0)   return { label: `${Math.abs(diff)}d overdue`, urgent: true  };
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
      className="flex items-center gap-2"
      style={{
        opacity: isPending ? 0.4 : 1,
        transition: "opacity var(--motion-fast) var(--ease-out-quart)",
        borderLeft: "1px solid var(--rule-soft)",
        marginLeft: 18,
        paddingLeft: "var(--space-3)",
      }}
    >
      {/* Checkbox — 32px touch target */}
      <button
        onClick={() => !done && startTransition(async () => { await completeSubtaskAction(subtask.id); })}
        disabled={isPending || done}
        className="flex-shrink-0 flex items-center justify-center transition-opacity hover:opacity-70"
        style={{ width: 32, height: 32 }}
        title={done ? "Completed" : "Mark complete"}
      >
        <span
          className="block flex items-center justify-center"
          style={{
            width: 14,
            height: 14,
            borderRadius: 3,
            border: "1.5px solid var(--rule)",
            background: done ? "var(--color-text-faint)" : "transparent",
            borderColor: done ? "var(--color-text-faint)" : "var(--rule)",
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
            className="w-full bg-transparent focus:outline-none"
            style={{ color: "var(--color-text)", fontSize: "var(--t-micro)" }}
          />
        ) : (
          <span
            className="cursor-text"
            style={{
              fontSize: "var(--t-micro)",
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

  const markerColor = task.priority === "high" ? "var(--accent)" : "var(--color-text-faint)";
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
    setTimeout(() => addInputRef.current?.focus(), 50);
  }

  return (
    <div
      style={{
        opacity: isPending ? 0.4 : 1,
        transition: "opacity var(--motion-fast) var(--ease-out-quart)",
      }}
    >
      {/* Parent row — hairline-separated, flush left, 44px touch target drives height */}
      <div className="flex items-center" style={{ gap: "var(--space-3)" }}>
        {/* Completion circle — 44px touch target, neutral hairline border */}
        <button
          onClick={handleComplete}
          disabled={isPending}
          className="flex-shrink-0 flex items-center justify-center transition-opacity hover:opacity-70"
          style={{ width: 44, height: 44 }}
          title="Mark complete"
        >
          <span
            className="rounded-full block"
            style={{
              width: 18,
              height: 18,
              border: "2px solid var(--color-text-faint)",
              background: "transparent",
            }}
          />
        </button>

        {/* Priority marker dot — amber for high, faint otherwise */}
        <span
          className="flex-shrink-0 rounded-full"
          style={{ width: 6, height: 6, background: markerColor }}
          aria-hidden
        />

        {/* Title + subtask progress */}
        <div className="flex-1 min-w-0 flex items-center" style={{ gap: "var(--space-2)" }}>
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
              className="flex-1 bg-transparent focus:outline-none"
              style={{ color: "var(--color-text)", fontSize: "var(--t-body)" }}
            />
          ) : (
            <span
              className="cursor-text"
              style={{
                color: "var(--color-text)",
                fontSize: "var(--t-body)",
                minWidth: 0,
                wordBreak: "break-word",
              }}
              onClick={() => setEditing(true)}
            >
              {task.title}
            </span>
          )}
          {task.category && (
            <span
              className="flex-shrink-0"
              style={{ fontSize: "var(--t-micro)", color: "var(--color-text-faint)" }}
            >
              {task.category}
            </span>
          )}
          {totalCount > 0 && (
            <span
              className="tnum flex-shrink-0"
              style={{
                fontSize: "var(--t-micro)",
                color: allDone ? "var(--color-positive)" : "var(--color-text-faint)",
              }}
            >
              {completedCount}/{totalCount}
            </span>
          )}
        </div>

        {/* Due date */}
        {due && (
          <span
            className="flex-shrink-0 tnum"
            style={{
              fontSize: "var(--t-micro)",
              color: due.urgent ? "var(--color-danger)" : "var(--color-text-faint)",
            }}
          >
            {due.label}
          </span>
        )}

        {/* Expand/collapse chevron */}
        {totalCount > 0 && (
          <button
            onClick={() => setExpanded((v) => !v)}
            className="flex-shrink-0 flex items-center justify-center transition-opacity hover:opacity-70"
            style={{ width: 32, height: 32, color: "var(--color-text-faint)" }}
            title={expanded ? "Collapse" : "Expand"}
          >
            {expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
          </button>
        )}

        {/* Edit due date / priority */}
        <button
          onClick={() => setShowEditPanel((v) => !v)}
          className="flex-shrink-0 flex items-center justify-center transition-opacity hover:opacity-70"
          style={{ width: 32, height: 32, color: "var(--color-text-faint)" }}
          title="Edit due date / priority"
        >
          <Pencil size={13} />
        </button>

        {/* Archive */}
        <button
          onClick={handleArchive}
          disabled={isPending}
          className="flex-shrink-0 flex items-center justify-center transition-opacity hover:opacity-70"
          style={{ width: 32, height: 32, color: "var(--color-text-faint)" }}
          title="Archive"
        >
          <Archive size={13} />
        </button>
      </div>

      {/* Due date / priority edit panel */}
      {showEditPanel && (
        <div
          className="flex items-center flex-wrap"
          style={{
            gap: "var(--space-3)",
            paddingBottom: "var(--space-3)",
            paddingLeft: 56,
          }}
        >
          <input
            type="date"
            value={editDueDate}
            onChange={(e) => setEditDueDate(e.target.value)}
            className="focus:outline-none"
            style={{
              fontSize: "var(--t-micro)",
              background: "transparent",
              border: "1px solid var(--rule)",
              borderRadius: "var(--r-1)",
              padding: "4px 8px",
              color: "var(--color-text)",
            }}
          />
          {editDueDate && (
            <button
              onClick={() => setEditDueDate("")}
              className="flex-shrink-0 p-1 transition-opacity hover:opacity-70"
              style={{ color: "var(--color-text-faint)" }}
              title="Clear date"
            >
              <X size={12} />
            </button>
          )}
          <select
            value={editPriority}
            onChange={(e) => setEditPriority(e.target.value as "high" | "medium" | "low")}
            className="focus:outline-none"
            style={{
              fontSize: "var(--t-micro)",
              background: "transparent",
              border: "1px solid var(--rule)",
              borderRadius: "var(--r-1)",
              padding: "4px 8px",
              color: "var(--color-text)",
            }}
          >
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
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
            className="transition-opacity hover:opacity-80"
            style={{
              fontSize: "var(--t-micro)",
              fontWeight: 500,
              background: "var(--accent)",
              color: "var(--color-text-on-cta)",
              borderRadius: "var(--r-1)",
              padding: "4px 10px",
            }}
          >
            Save
          </button>
          <button
            onClick={() => setShowEditPanel(false)}
            className="flex-shrink-0 p-1 transition-opacity hover:opacity-70"
            style={{ color: "var(--color-text-faint)" }}
            title="Cancel"
          >
            <X size={12} />
          </button>
        </div>
      )}

      {/* Subtask list + add input */}
      {expanded && (
        <div
          style={{
            paddingLeft: 56,
            paddingBottom: "var(--space-2)",
            display: "flex",
            flexDirection: "column",
            gap: 2,
          }}
        >
          {subtasks.map((sub) => (
            <SubtaskRow
              key={sub.id}
              subtask={sub}
              completeSubtaskAction={completeSubtaskAction}
              deleteSubtaskAction={deleteSubtaskAction}
              updateAction={updateAction}
            />
          ))}

          <div
            className="flex items-center gap-2"
            style={{
              borderLeft: "1px solid var(--rule-soft)",
              marginLeft: 18,
              paddingLeft: "var(--space-3)",
              paddingTop: 2,
              paddingBottom: 2,
            }}
          >
            <input
              ref={addInputRef}
              value={addInput}
              onChange={(e) => setAddInput(e.target.value)}
              onKeyDown={handleAddSubtask}
              placeholder="Add item…"
              className="flex-1 bg-transparent focus:outline-none"
              style={{
                fontSize: "var(--t-micro)",
                color: "var(--color-text)",
                caretColor: "var(--accent)",
                paddingTop: 4,
                paddingBottom: 4,
              }}
            />
          </div>
        </div>
      )}

      {/* Show add input even when collapsed with no subtasks */}
      {!expanded && totalCount === 0 && (
        <div
          style={{
            paddingLeft: 56,
            paddingBottom: "var(--space-2)",
          }}
        >
          <div
            className="flex items-center gap-2"
            style={{
              borderLeft: "1px solid var(--rule-soft)",
              marginLeft: 18,
              paddingLeft: "var(--space-3)",
              paddingTop: 2,
              paddingBottom: 2,
            }}
          >
            <input
              ref={addInputRef}
              value={addInput}
              onChange={(e) => setAddInput(e.target.value)}
              onKeyDown={handleAddSubtask}
              placeholder="Add item…"
              className="flex-1 bg-transparent focus:outline-none"
              style={{
                fontSize: "var(--t-micro)",
                color: "var(--color-text)",
                caretColor: "var(--accent)",
                paddingTop: 4,
                paddingBottom: 4,
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
