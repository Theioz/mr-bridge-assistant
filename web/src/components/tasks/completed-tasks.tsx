"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import type { Task } from "@/lib/types";

const PRIORITY_COLOR: Record<string, string> = {
  high:   "var(--color-danger)",
  medium: "var(--color-warning)",
  low:    "var(--color-text-faint)",
};

interface Props {
  tasks: Task[];
}

export default function CompletedTasks({ tasks }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <section>
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 mb-2"
        style={{ color: "var(--color-text-muted)" }}
      >
        {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        <span
          className="text-xs uppercase tracking-widest"
          style={{ letterSpacing: "0.07em" }}
        >
          Completed ({tasks.length})
        </span>
      </button>

      {open && (
        <div
          className="rounded-xl overflow-hidden"
          style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)" }}
        >
          {tasks.map((task, i) => {
            const dot = PRIORITY_COLOR[task.priority ?? "low"] ?? PRIORITY_COLOR.low;
            const completedDate = task.completed_at
              ? new Date(task.completed_at).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                })
              : null;

            return (
              <div
                key={task.id}
                className="flex items-center gap-3 px-4 py-2.5"
                style={i > 0 ? { borderTop: "1px solid var(--color-border)" } : {}}
              >
                {/* Filled checkmark circle */}
                <span
                  className="flex-shrink-0 rounded-full border-2 flex items-center justify-center"
                  style={{ width: 18, height: 18, borderColor: dot, background: dot }}
                >
                  <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
                    <path
                      d="M1.5 4L3 5.5L6.5 2"
                      stroke="currentColor"
                      style={{ color: "var(--color-text-on-cta)" }}
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </span>

                <span
                  className="flex-1 text-sm line-through min-w-0 truncate"
                  style={{ color: "var(--color-text-faint)" }}
                >
                  {task.title}
                </span>

                {completedDate && (
                  <span className="flex-shrink-0 text-xs" style={{ color: "var(--color-text-faint)" }}>
                    {completedDate}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
