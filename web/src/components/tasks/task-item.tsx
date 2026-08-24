"use client";

import { useState, useTransition, useRef, useEffect } from "react";
import { Archive, CalendarClock, ChevronDown, ChevronRight, Pencil, Repeat, X } from "lucide-react";
import type { Task, Subtask, TaskList, TaskSeries } from "@/lib/types";
import { cadenceLabel, type Freq } from "@/lib/tasks/recurrence";
import type { ScheduleBlock } from "@/lib/tasks/schedule-task";
import { todayString } from "@/lib/timezone";
import TimeSelect from "./time-select";

function relativeDue(dateStr: string): { label: string; urgent: boolean } {
  const today = todayString();
  const diff = Math.round(
    (new Date(dateStr + "T00:00:00").getTime() - new Date(today + "T00:00:00").getTime()) /
      86_400_000,
  );
  if (diff < 0) return { label: `${Math.abs(diff)}d overdue`, urgent: true };
  if (diff === 0) return { label: "Today", urgent: true };
  if (diff === 1) return { label: "Tomorrow", urgent: false };
  if (diff <= 7) return { label: `${diff}d`, urgent: false };
  return { label: dateStr.slice(5).replace("-", "/"), urgent: false };
}

interface Props {
  task: Task;
  lists: TaskList[];
  completeAction: (id: string) => Promise<{ error?: string }>;
  archiveAction: (id: string) => Promise<{ error?: string }>;
  updateAction: (
    id: string,
    fields: {
      title?: string;
      due_date?: string | null;
      priority?: string | null;
      list_id?: string | null;
    },
  ) => Promise<{ error?: string }>;
  addSubtaskAction: (parentId: string, title: string) => Promise<{ error?: string }>;
  completeSubtaskAction: (id: string) => Promise<{ error?: string }>;
  deleteSubtaskAction: (id: string) => Promise<{ error?: string }>;
  scheduleAction: (
    id: string,
    block: ScheduleBlock,
  ) => Promise<{ error?: string; warning?: string }>;
  unscheduleAction: (id: string) => Promise<{ error?: string; warning?: string }>;
  /** The rule behind this occurrence, when the task carries a series_id (#468). */
  series?: TaskSeries | null;
  /** "This occurrence only" — split the row out of its series so a series edit won't overwrite it. */
  detachAction?: (taskId: string) => Promise<{ error?: string }>;
  /** "Whole series" — edit the rule; future unfinished occurrences are regenerated from it. */
  updateSeriesAction?: (
    seriesId: string,
    fields: {
      title?: string;
      priority?: string | null;
      list_id?: string | null;
      ends_on?: string | null;
    },
  ) => Promise<{ error?: string }>;
}

/** Local YYYY-MM-DD / HH:MM parts of an ISO instant, for the date/time inputs. */
function localParts(iso: string): { date: string; time: string } {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return {
    date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    time: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
  };
}

/** All-day date label ("Aug 20") from the noon-UTC marker, without a tz shift. */
function formatDay(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

/** Timed label, e.g. "Aug 20, 2:00 PM". */
function formatScheduled(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

/** What every tasks server action returns: a soft failure, not a throw. */
type ActionResult = { error?: string; warning?: string } | void | undefined;

/**
 * Await a server action and surface its outcome into a row-level error slot.
 *
 * The bug this exists to kill (#687): every mutation here used to be `await someAction(...)`
 * with the return value dropped. The actions signal failure by RETURNING `{ error }` rather than
 * throwing, so nothing rejected, `useTransition` resolved normally, `isPending` flipped back, and
 * the row un-greyed looking exactly as it had. The UI reported success by omission and the write
 * was gone. Reloading was the only way to find out.
 *
 * Returns true on success so callers can chain — the edit-scope handlers must not apply an edit
 * after a failed detach.
 */
async function runAction(
  fn: () => Promise<ActionResult>,
  setError: (msg: string | null) => void,
): Promise<boolean> {
  try {
    const res = await fn();
    if (res && res.error) {
      setError(res.error);
      return false;
    }
    // A successful mutation clears whatever failure was showing on this row, and surfaces a
    // partial-success warning (e.g. saved but the calendar didn't sync) in the same slot.
    setError(res?.warning ?? null);
    return true;
  } catch (e) {
    // A server action can also reject outright — a dropped connection, an RSC transport error.
    // That path produced an unhandled rejection and the same silent grey-then-nothing.
    setError(e instanceof Error ? e.message : "Something went wrong — the change was not saved.");
    return false;
  }
}

/** Shared style for the row-level error line. */
const rowErrorStyle = {
  fontSize: "var(--t-micro)",
  color: "var(--color-danger)",
  paddingLeft: 56,
  paddingBottom: "var(--space-2)",
} as const;

function SubtaskRow({
  subtask,
  completeSubtaskAction,
  deleteSubtaskAction,
  updateAction,
}: {
  subtask: Subtask;
  completeSubtaskAction: (id: string) => Promise<{ error?: string }>;
  deleteSubtaskAction: (id: string) => Promise<{ error?: string }>;
  updateAction: (
    id: string,
    fields: { title?: string; due_date?: string | null; priority?: string | null },
  ) => Promise<{ error?: string }>;
}) {
  const [isPending, startTransition] = useTransition();
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(subtask.title);
  const [rowError, setRowError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  function commitEdit() {
    setEditing(false);
    const trimmed = editTitle.trim();
    if (trimmed && trimmed !== subtask.title) {
      startTransition(async () => {
        const ok = await runAction(() => updateAction(subtask.id, { title: trimmed }), setRowError);
        // Put the old title back so the row never shows a value the database does not hold.
        if (!ok) setEditTitle(subtask.title);
      });
    } else {
      setEditTitle(subtask.title);
    }
  }

  const done = subtask.status === "completed";

  return (
    <>
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
          onClick={() =>
            !done &&
            startTransition(async () => {
              await runAction(() => completeSubtaskAction(subtask.id), setRowError);
            })
          }
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
                if (e.key === "Enter") commitEdit();
                if (e.key === "Escape") {
                  setEditTitle(subtask.title);
                  setEditing(false);
                }
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
            onClick={() =>
              startTransition(async () => {
                await runAction(() => deleteSubtaskAction(subtask.id), setRowError);
              })
            }
            disabled={isPending}
            className="flex-shrink-0 p-1 rounded transition-opacity hover:opacity-70"
            style={{ color: "var(--color-text-faint)" }}
            title="Remove"
          >
            <X size={12} />
          </button>
        )}
      </div>
      {rowError && (
        <p role="alert" style={{ ...rowErrorStyle, paddingLeft: 8 }}>
          {rowError}
        </p>
      )}
    </>
  );
}

export default function TaskItem({
  task,
  lists,
  completeAction,
  archiveAction,
  updateAction,
  addSubtaskAction,
  completeSubtaskAction,
  deleteSubtaskAction,
  scheduleAction,
  unscheduleAction,
  series = null,
  detachAction,
  updateSeriesAction,
}: Props) {
  const [isPending, startTransition] = useTransition();
  // Which edit a pending change should apply to. Null = no prompt showing. This is the part that
  // gets skipped and then hurts: silently editing one occurrence when the user meant the rule
  // (or vice versa) is the classic recurring-task bug.
  const [scopePrompt, setScopePrompt] = useState<null | { kind: "title" | "fields" }>(null);
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(task.title);
  const inputRef = useRef<HTMLInputElement>(null);

  const subtasks = task.subtasks ?? [];
  const defaultExpanded = subtasks.length <= 3;
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [addInput, setAddInput] = useState("");
  const addInputRef = useRef<HTMLInputElement>(null);

  const [showEditPanel, setShowEditPanel] = useState(false);
  const [editDueDate, setEditDueDate] = useState(task.due_date ?? "");
  const [editPriority, setEditPriority] = useState<"high" | "medium" | "low">(
    (task.priority as "high" | "medium" | "low") ?? "medium",
  );
  const [editListId, setEditListId] = useState(task.list_id ?? "");

  const taskList = task.list_id ? lists.find((l) => l.id === task.list_id) : null;

  // Scheduling — seed from an existing block. All-day: date only, times blank. Timed: date + times.
  const seededStart = task.scheduled_start ? localParts(task.scheduled_start) : null;
  const seededEnd = task.scheduled_end ? localParts(task.scheduled_end) : null;
  const seededDate = task.scheduled_all_day
    ? (task.scheduled_start ?? "").slice(0, 10) // noon-UTC marker → the intended date
    : (seededStart?.date ?? "");
  const [showSchedule, setShowSchedule] = useState(false);
  const [schedDate, setSchedDate] = useState(seededDate);
  const [schedStart, setSchedStart] = useState(
    task.scheduled_all_day ? "" : (seededStart?.time ?? ""),
  );
  const [schedEnd, setSchedEnd] = useState(task.scheduled_all_day ? "" : (seededEnd?.time ?? ""));
  const [schedNote, setSchedNote] = useState<string | null>(null);
  // ONE slot for the whole row (#687), not one per mutation. schedNote stays separate on purpose:
  // it belongs inside the schedule panel, next to the form that produced it, and was already
  // handling its result correctly.
  const [rowError, setRowError] = useState<string | null>(null);

  function saveSchedule() {
    if (!schedDate) {
      setSchedNote("Pick a date.");
      return;
    }
    if (schedStart && schedEnd && schedEnd <= schedStart) {
      setSchedNote("End time must be after start time.");
      return;
    }
    // A start time → timed (blank end defaults to +30 min). No start time → all-day.
    const block: ScheduleBlock = schedStart
      ? (() => {
          const s = new Date(`${schedDate}T${schedStart}`);
          const e = schedEnd
            ? new Date(`${schedDate}T${schedEnd}`)
            : new Date(s.getTime() + 30 * 60_000);
          return { allDay: false as const, startISO: s.toISOString(), endISO: e.toISOString() };
        })()
      : { allDay: true, date: schedDate };
    setSchedNote(null);
    startTransition(async () => {
      const res = await scheduleAction(task.id, block);
      if (res.error) {
        setSchedNote(res.error);
        return;
      }
      if (res.warning) setSchedNote(res.warning);
      else setShowSchedule(false);
    });
  }

  function removeSchedule() {
    startTransition(async () => {
      const res = await unscheduleAction(task.id);
      if (res.error) setSchedNote(res.error);
      else {
        setSchedNote(res.warning ?? null);
        if (!res.warning) setShowSchedule(false);
      }
    });
  }

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  const markerColor = task.priority === "high" ? "var(--accent)" : "var(--color-text-faint)";
  const due = task.due_date ? relativeDue(task.due_date) : null;

  const completedCount = subtasks.filter((s) => s.status === "completed").length;
  const totalCount = subtasks.length;
  const allDone = totalCount > 0 && completedCount === totalCount;

  function handleComplete() {
    startTransition(async () => {
      await runAction(() => completeAction(task.id), setRowError);
    });
  }

  function handleArchive() {
    startTransition(async () => {
      await runAction(() => archiveAction(task.id), setRowError);
    });
  }

  function commitEdit() {
    setEditing(false);
    const trimmed = editTitle.trim();
    if (!trimmed || trimmed === task.title) {
      setEditTitle(task.title);
      return;
    }
    // A recurring occurrence must not silently pick a scope for the user.
    if (task.series_id && series && detachAction && updateSeriesAction) {
      setScopePrompt({ kind: "title" });
      return;
    }
    startTransition(async () => {
      const ok = await runAction(() => updateAction(task.id, { title: trimmed }), setRowError);
      // Restore the old title on failure so the row never displays a value the database rejected.
      if (!ok) setEditTitle(task.title);
    });
  }

  /** Apply the pending edit to just this row, detaching it from the series first. */
  function applyToOccurrence() {
    const prompt = scopePrompt;
    setScopePrompt(null);
    if (!prompt || !detachAction) return;
    startTransition(async () => {
      const detached = await runAction(() => detachAction(task.id), setRowError);
      if (!detached) {
        setEditTitle(task.title);
        return;
      }
      const ok =
        prompt.kind === "title"
          ? await runAction(() => updateAction(task.id, { title: editTitle.trim() }), setRowError)
          : await runAction(
              () =>
                updateAction(task.id, {
                  due_date: editDueDate || null,
                  priority: editPriority || null,
                  list_id: editListId || null,
                }),
              setRowError,
            );
      if (!ok) setEditTitle(task.title);
    });
  }

  /** Apply the pending edit to the rule, so future occurrences follow it. */
  function applyToSeries() {
    const prompt = scopePrompt;
    setScopePrompt(null);
    if (!prompt || !series || !updateSeriesAction) return;
    startTransition(async () => {
      const ok =
        prompt.kind === "title"
          ? await runAction(
              () => updateSeriesAction(series.id, { title: editTitle.trim() }),
              setRowError,
            )
          : await runAction(
              () =>
                updateSeriesAction(series.id, {
                  priority: editPriority || null,
                  list_id: editListId || null,
                }),
              setRowError,
            );
      if (!ok) setEditTitle(task.title);
    });
  }

  function handleAddSubtask(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key !== "Enter") return;
    const trimmed = addInput.trim();
    if (!trimmed) return;
    setAddInput("");
    startTransition(async () => {
      await runAction(() => addSubtaskAction(task.id, trimmed), setRowError);
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
                if (e.key === "Enter") commitEdit();
                if (e.key === "Escape") {
                  setEditTitle(task.title);
                  setEditing(false);
                }
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
          {taskList ? (
            <span
              className="flex items-center flex-shrink-0"
              style={{ gap: 4, fontSize: "var(--t-micro)", color: "var(--color-text-faint)" }}
            >
              <span
                className="rounded-full block"
                style={{
                  width: 6,
                  height: 6,
                  background: taskList.color ?? "var(--color-text-faint)",
                }}
                aria-hidden
              />
              {taskList.name}
            </span>
          ) : (
            task.category && (
              <span
                className="flex-shrink-0"
                style={{ fontSize: "var(--t-micro)", color: "var(--color-text-faint)" }}
              >
                {task.category}
              </span>
            )
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

        {/* Recurring-series chip */}
        {task.series_id && series && (
          <span
            className="flex items-center flex-shrink-0"
            style={{ gap: 3, fontSize: "var(--t-micro)", color: "var(--color-text-muted)" }}
            title={`Repeats ${cadenceLabel({ freq: series.freq as Freq, interval: series.interval, byweekday: series.byweekday })}${series.ends_on ? ` until ${series.ends_on}` : ""}`}
          >
            <Repeat size={11} />
            {cadenceLabel({
              freq: series.freq as Freq,
              interval: series.interval,
              byweekday: series.byweekday,
            })}
          </span>
        )}

        {/* Scheduled block chip */}
        {task.scheduled_start && (
          <span
            className="flex items-center flex-shrink-0 tnum"
            style={{ gap: 3, fontSize: "var(--t-micro)", color: "var(--accent)" }}
            title="On your calendar"
          >
            <CalendarClock size={11} />
            {task.scheduled_all_day
              ? `${formatDay(task.scheduled_start)} · all day`
              : formatScheduled(task.scheduled_start)}
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

        {/* Schedule on calendar */}
        <button
          onClick={() => setShowSchedule((v) => !v)}
          className="flex-shrink-0 flex items-center justify-center transition-opacity hover:opacity-70"
          style={{
            width: 32,
            height: 32,
            color: task.scheduled_start ? "var(--accent)" : "var(--color-text-faint)",
          }}
          title={task.scheduled_start ? "Edit calendar block" : "Add to calendar"}
        >
          <CalendarClock size={13} />
        </button>

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

      {/* Row-level mutation error (#687). Persists until the next successful mutation on this row
          or an explicit dismiss — never cleared on a timer, or the failure goes invisible again,
          which is the whole bug. */}
      {rowError && (
        <div
          className="flex items-start"
          style={{ gap: "var(--space-2)", ...rowErrorStyle }}
          role="alert"
        >
          <span style={{ flex: 1, minWidth: 0 }}>{rowError}</span>
          <button
            type="button"
            onClick={() => setRowError(null)}
            className="flex-shrink-0 p-1 transition-opacity hover:opacity-70"
            style={{ color: "var(--color-text-faint)" }}
            title="Dismiss"
            aria-label="Dismiss error"
          >
            <X size={12} />
          </button>
        </div>
      )}

      {/* Edit scope: this occurrence, or the whole series? (#468) */}
      {scopePrompt && (
        <div
          role="group"
          aria-label="Apply this change to"
          className="flex items-center flex-wrap"
          style={{
            gap: "var(--space-2)",
            paddingBottom: "var(--space-3)",
            paddingLeft: 56,
          }}
        >
          <span style={{ fontSize: "var(--t-micro)", color: "var(--color-text-muted)" }}>
            Apply to
          </span>
          <button
            type="button"
            onClick={applyToOccurrence}
            className="transition-opacity hover:opacity-80"
            style={{
              fontSize: "var(--t-micro)",
              background: "transparent",
              border: "1px solid var(--rule)",
              borderRadius: "var(--r-1)",
              padding: "4px 10px",
              color: "var(--color-text)",
            }}
            title="Splits this one out of the series — future occurrences are unaffected"
          >
            This occurrence
          </button>
          <button
            type="button"
            onClick={applyToSeries}
            className="transition-opacity hover:opacity-80"
            style={{
              fontSize: "var(--t-micro)",
              fontWeight: 500,
              background: "var(--accent)",
              color: "var(--color-text-on-cta)",
              borderRadius: "var(--r-1)",
              padding: "4px 10px",
            }}
            title="Changes the rule — future unfinished occurrences are regenerated"
          >
            The whole series
          </button>
          <button
            type="button"
            onClick={() => {
              setScopePrompt(null);
              setEditTitle(task.title);
            }}
            className="flex-shrink-0 p-1 transition-opacity hover:opacity-70"
            style={{ color: "var(--color-text-faint)" }}
            title="Cancel"
          >
            <X size={12} />
          </button>
        </div>
      )}

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
            aria-label="Due date"
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
            aria-label="Priority"
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
          {lists.length > 0 && (
            <select
              aria-label="List"
              value={editListId}
              onChange={(e) => setEditListId(e.target.value)}
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
              <option value="">No list</option>
              {lists.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          )}
          <button
            onClick={() => {
              setShowEditPanel(false);
              if (task.series_id && series && detachAction && updateSeriesAction) {
                setScopePrompt({ kind: "fields" });
                return;
              }
              startTransition(async () => {
                await runAction(
                  () =>
                    updateAction(task.id, {
                      due_date: editDueDate || null,
                      priority: editPriority || null,
                      list_id: editListId || null,
                    }),
                  setRowError,
                );
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

      {/* Calendar scheduling panel */}
      {showSchedule && (
        <div style={{ paddingBottom: "var(--space-3)", paddingLeft: 56 }}>
          <div className="flex items-center flex-wrap" style={{ gap: "var(--space-2)" }}>
            <input
              type="date"
              aria-label="Schedule date"
              value={schedDate}
              onChange={(e) => setSchedDate(e.target.value)}
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
            <TimeSelect
              ariaLabel="Start time"
              value={schedStart}
              onChange={setSchedStart}
              placeholder="all-day"
            />
            <span style={{ color: "var(--color-text-faint)", fontSize: "var(--t-micro)" }}>–</span>
            <TimeSelect
              ariaLabel="End time"
              value={schedEnd}
              onChange={setSchedEnd}
              placeholder="end"
            />
            <span
              style={{ fontSize: "var(--t-micro)", color: "var(--color-text-faint)" }}
              title="Leave times blank for an all-day event"
            >
              {schedStart ? "" : "all-day"}
            </span>
            <button
              onClick={saveSchedule}
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
              {task.scheduled_start ? "Update" : "Add to calendar"}
            </button>
            {task.scheduled_start && (
              <button
                onClick={removeSchedule}
                className="transition-opacity hover:opacity-70"
                style={{ fontSize: "var(--t-micro)", color: "var(--color-danger)" }}
              >
                Remove
              </button>
            )}
            <button
              onClick={() => setShowSchedule(false)}
              className="flex-shrink-0 p-1 transition-opacity hover:opacity-70"
              style={{ color: "var(--color-text-faint)" }}
              title="Cancel"
            >
              <X size={12} />
            </button>
          </div>
          {schedNote && (
            <p style={{ fontSize: "var(--t-micro)", color: "var(--color-danger)", marginTop: 4 }}>
              {schedNote}
            </p>
          )}
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
