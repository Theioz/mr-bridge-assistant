"use client";

import { useState, useTransition, useRef } from "react";
import { Plus, CalendarClock, Repeat } from "lucide-react";
import type { TaskList } from "@/lib/types";
import type { ScheduleBlock } from "@/lib/tasks/schedule-task";
import type { Freq, SeriesDraft } from "@/lib/tasks/recurrence";
import TimeSelect from "./time-select";
import RepeatControl, { toDraft } from "./repeat-control";

interface Props {
  addAction: (
    title: string,
    priority: string,
    dueDate: string,
    listId: string,
    schedule: ScheduleBlock | null,
    recurrence: SeriesDraft | null,
  ) => Promise<{ error?: string; warning?: string }>;
  lists: TaskList[];
  defaultListId: string;
}

/** Today as YYYY-MM-DD in the browser's local zone. */
function todayLocal(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

const PRIORITIES = [
  { key: "high", label: "High", color: "var(--accent)" },
  { key: "medium", label: "Medium", color: "var(--color-text-muted)" },
  { key: "low", label: "Low", color: "var(--color-text-faint)" },
] as const;

export default function AddTaskForm({ addAction, lists, defaultListId }: Props) {
  const [title, setTitle] = useState("");
  const [priority, setPriority] = useState<"high" | "medium" | "low">("medium");
  const [dueDate, setDueDate] = useState("");
  const [listId, setListId] = useState(defaultListId);
  const [calendarOn, setCalendarOn] = useState(false);
  // Repeats is off by default — a one-off task should not pay for this.
  const [repeatOn, setRepeatOn] = useState(false);
  const [freq, setFreq] = useState<Freq>("weekly");
  const [interval, setInterval] = useState(1);
  const [byweekday, setByweekday] = useState<number[]>([]);
  const [endsOn, setEndsOn] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  // Build the calendar block from the toggle + date + times. Blank times → all-day; a lone start
  // gets a default 30-min end. Event date is the due-date, or today if none is set.
  function buildSchedule(): ScheduleBlock | null {
    if (!calendarOn) return null;
    const date = dueDate || todayLocal();
    if (startTime) {
      const s = new Date(`${date}T${startTime}`);
      const e = endTime ? new Date(`${date}T${endTime}`) : new Date(s.getTime() + 30 * 60_000);
      return { allDay: false, startISO: s.toISOString(), endISO: e.toISOString() };
    }
    return { allDay: true, date };
  }

  function handleSubmit(e?: React.FormEvent) {
    e?.preventDefault();
    if (!title.trim() || isPending) return;
    if (calendarOn && startTime && endTime && endTime <= startTime) {
      setError("End time must be after start time.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const recurrence = repeatOn
        ? toDraft(freq, interval, byweekday, dueDate || todayLocal(), endsOn)
        : null;
      const result = await addAction(
        title.trim(),
        priority,
        dueDate,
        listId,
        buildSchedule(),
        recurrence,
      );
      if (result.error) {
        setError(result.error);
        return;
      }
      setError(result.warning ?? null);
      setTitle("");
      setPriority("medium");
      setDueDate("");
      setStartTime("");
      setEndTime("");
      setByweekday([]);
      setEndsOn("");
      setInterval(1);
      // Keep the list selection, calendar toggle and repeat toggle — you're usually adding several
      // similar tasks.
      inputRef.current?.focus();
    });
  }

  return (
    <form
      onSubmit={handleSubmit}
      style={{
        background: "transparent",
        borderBottom: "1px solid var(--rule)",
      }}
    >
      <div
        className="flex items-center flex-wrap sm:flex-nowrap"
        style={{
          gap: "var(--space-3)",
          paddingTop: "var(--space-3)",
          paddingBottom: "var(--space-3)",
        }}
      >
        <Plus size={16} style={{ color: "var(--accent)", flexShrink: 0 }} aria-hidden />

        <input
          ref={inputRef}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => {
            // preventDefault stops the form's native submit from ALSO firing handleSubmit — a
            // double-fire raced two adds and left the transition wedged (issue: box "disappeared").
            if (e.key === "Enter") {
              e.preventDefault();
              handleSubmit();
            }
          }}
          placeholder="Add a task…"
          className="bg-transparent focus:outline-none"
          style={{
            color: "var(--color-text)",
            fontSize: "var(--t-body)",
            caretColor: "var(--accent)",
            // flex-grow, but never shrink below a legible width — with min-w-0 the extra controls
            // in this row could squeeze the input to zero and it looked like it had vanished.
            flex: "1 1 160px",
            minWidth: 160,
          }}
        />

        {/* Priority dot selector */}
        <div
          className="flex items-center flex-shrink-0"
          style={{ gap: "var(--space-1)" }}
          title="Priority"
        >
          {PRIORITIES.map(({ key, label, color }) => (
            <button
              key={key}
              type="button"
              onClick={() => setPriority(key)}
              className="flex items-center justify-center transition-opacity hover:opacity-80"
              style={{ width: 32, height: 32, borderRadius: "50%" }}
              title={label}
            >
              <span
                className="rounded-full block"
                style={{
                  width: 12,
                  height: 12,
                  border: `1.5px solid ${color}`,
                  background: priority === key ? color : "transparent",
                  transition: "background var(--motion-fast) var(--ease-out-quart)",
                }}
              />
            </button>
          ))}
        </div>

        {lists.length > 0 && (
          <select
            aria-label="List"
            value={listId}
            onChange={(e) => setListId(e.target.value)}
            className="focus:outline-none flex-shrink-0"
            style={{
              fontSize: "var(--t-micro)",
              background: "transparent",
              border: "1px solid var(--rule)",
              borderRadius: "var(--r-1)",
              padding: "4px 8px",
              color: listId ? "var(--color-text)" : "var(--color-text-faint)",
              maxWidth: 120,
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

        <input
          type="date"
          aria-label="Due date"
          value={dueDate}
          onChange={(e) => setDueDate(e.target.value)}
          className="focus:outline-none flex-shrink-0"
          style={{
            fontSize: "var(--t-micro)",
            background: "transparent",
            border: "1px solid var(--rule)",
            borderRadius: "var(--r-1)",
            padding: "4px 8px",
            color: dueDate ? "var(--color-text)" : "var(--color-text-faint)",
            width: 120,
          }}
        />

        {/* Calendar toggle + optional time block */}
        <button
          type="button"
          onClick={() => setCalendarOn((v) => !v)}
          className="flex-shrink-0 flex items-center justify-center transition-opacity hover:opacity-80"
          style={{
            width: 32,
            height: 32,
            borderRadius: "var(--r-1)",
            border: "1px solid var(--rule)",
            color: calendarOn ? "var(--color-text-on-cta)" : "var(--color-text-faint)",
            background: calendarOn ? "var(--accent)" : "transparent",
          }}
          title={calendarOn ? "On calendar (click to turn off)" : "Add to calendar"}
          aria-pressed={calendarOn}
        >
          <CalendarClock size={14} />
        </button>

        {calendarOn && (
          <div className="flex items-center flex-shrink-0" style={{ gap: "var(--space-1)" }}>
            <TimeSelect
              ariaLabel="Start time"
              value={startTime}
              onChange={setStartTime}
              placeholder="all-day"
            />
            <span style={{ color: "var(--color-text-faint)", fontSize: "var(--t-micro)" }}>–</span>
            <TimeSelect
              ariaLabel="End time"
              value={endTime}
              onChange={setEndTime}
              placeholder="end"
            />
          </div>
        )}

        <button
          type="button"
          onClick={() => setRepeatOn((v) => !v)}
          className="flex-shrink-0 flex items-center justify-center transition-opacity hover:opacity-80"
          style={{
            width: 32,
            height: 32,
            borderRadius: "var(--r-1)",
            border: "1px solid var(--rule)",
            color: repeatOn ? "var(--color-text-on-cta)" : "var(--color-text-faint)",
            background: repeatOn ? "var(--accent)" : "transparent",
          }}
          title={repeatOn ? "Repeats (click to turn off)" : "Make this repeat"}
          aria-pressed={repeatOn}
        >
          <Repeat size={14} />
        </button>

        <button
          type="submit"
          disabled={!title.trim() || isPending}
          className="flex-shrink-0 transition-opacity disabled:opacity-30 hover:opacity-80"
          style={{
            fontSize: "var(--t-micro)",
            fontWeight: 500,
            background: "var(--accent)",
            color: "var(--color-text-on-cta)",
            borderRadius: "var(--r-1)",
            padding: "6px 12px",
          }}
        >
          {isPending ? "…" : "Add"}
        </button>
      </div>

      {repeatOn && (
        <RepeatControl
          freq={freq}
          interval={interval}
          byweekday={byweekday}
          endsOn={endsOn}
          startsOn={dueDate || todayLocal()}
          onChange={(patch) => {
            if (patch.freq !== undefined) setFreq(patch.freq);
            if (patch.interval !== undefined) setInterval(patch.interval);
            if (patch.byweekday !== undefined) setByweekday(patch.byweekday);
            if (patch.endsOn !== undefined) setEndsOn(patch.endsOn);
          }}
        />
      )}

      {error && (
        <p
          style={{
            fontSize: "var(--t-micro)",
            color: "var(--color-danger)",
            paddingBottom: "var(--space-3)",
          }}
        >
          {error}
        </p>
      )}
    </form>
  );
}
