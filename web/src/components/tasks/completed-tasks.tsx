"use client";

import { useState, useTransition } from "react";
import { ChevronDown, ChevronRight, RotateCcw } from "lucide-react";
import type { Task } from "@/lib/types";
import { groupCompletedByDay } from "@/lib/tasks/history";

interface Props {
  tasks: Task[];
  restoreAction: (id: string) => Promise<{ error?: string }>;
  /** Retention window in days — completed tasks older than this have been purged (#684). */
  retentionDays: number;
  /** User's timezone and today's date in it, so days group the same on server and client. */
  timeZone: string;
  today: string;
}

export default function CompletedTasks({
  tasks,
  restoreAction,
  retentionDays,
  timeZone,
  today,
}: Props) {
  const [open, setOpen] = useState(false);
  const groups = groupCompletedByDay(tasks, timeZone, today);

  return (
    <section>
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center transition-opacity hover:opacity-80"
        style={{
          gap: "var(--space-2)",
          color: "var(--color-text-faint)",
          marginBottom: "var(--space-2)",
        }}
        aria-expanded={open}
      >
        {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        <h2 className="db-section-label" style={{ margin: 0 }}>
          Completed
          <span className="meta">· {tasks.length}</span>
        </h2>
      </button>

      {open && (
        <div>
          <p
            style={{
              fontSize: "var(--t-micro)",
              color: "var(--color-text-faint)",
              marginBottom: "var(--space-2)",
            }}
          >
            Last {retentionDays} days. Older completed tasks are deleted.
          </p>
          {groups.map((group) => (
            <div key={group.day} style={{ marginTop: "var(--space-3)" }}>
              <h3
                className="tnum"
                style={{
                  fontSize: "var(--t-micro)",
                  color: "var(--color-text-muted)",
                  fontWeight: 500,
                  margin: 0,
                }}
              >
                {group.label}
              </h3>
              {group.tasks.map((task, i) => (
                <CompletedRow
                  key={task.id}
                  task={task}
                  first={i === 0}
                  restoreAction={restoreAction}
                />
              ))}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function CompletedRow({
  task,
  first,
  restoreAction,
}: {
  task: Task;
  first: boolean;
  restoreAction: (id: string) => Promise<{ error?: string }>;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleRestore() {
    setError(null);
    startTransition(async () => {
      const res = await restoreAction(task.id);
      if (res.error) setError(res.error);
    });
  }

  return (
    <div
      style={{
        borderTop: first ? undefined : "1px solid var(--rule-soft)",
        opacity: isPending ? 0.4 : 1,
        transition: "opacity var(--motion-fast) var(--ease-out-quart)",
      }}
    >
      <div
        className="flex items-center"
        style={{
          gap: "var(--space-3)",
          paddingTop: "var(--space-2)",
          paddingBottom: "var(--space-2)",
        }}
      >
        {/* Filled checkmark circle — faint */}
        <span
          className="flex-shrink-0 rounded-full flex items-center justify-center"
          style={{
            width: 18,
            height: 18,
            background: "var(--color-text-faint)",
          }}
          aria-hidden
        >
          <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
            <path
              d="M1.5 4L3 5.5L6.5 2"
              stroke="var(--color-text-on-cta)"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>

        <span
          className="flex-1 min-w-0 truncate"
          style={{
            fontSize: "var(--t-body)",
            color: "var(--color-text-faint)",
            textDecoration: "line-through",
          }}
        >
          {task.title}
        </span>

        <button
          type="button"
          onClick={handleRestore}
          disabled={isPending}
          className="flex-shrink-0 flex items-center justify-center transition-opacity hover:opacity-70"
          style={{
            gap: 4,
            height: 32,
            paddingLeft: 8,
            paddingRight: 8,
            fontSize: "var(--t-micro)",
            color: "var(--color-text-muted)",
          }}
          title="Move back to active tasks"
          aria-label={`Restore "${task.title}"`}
        >
          <RotateCcw size={13} aria-hidden />
          Restore
        </button>
      </div>
      {error && (
        <p
          role="alert"
          style={{
            fontSize: "var(--t-micro)",
            color: "var(--color-danger)",
            paddingBottom: "var(--space-2)",
          }}
        >
          {error}
        </p>
      )}
    </div>
  );
}
