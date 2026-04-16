"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import type { Task } from "@/lib/types";

interface Props {
  tasks: Task[];
}

export default function CompletedTasks({ tasks }: Props) {
  const [open, setOpen] = useState(false);

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
      >
        {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        <h2 className="db-section-label" style={{ margin: 0 }}>
          Completed
          <span className="meta">· {tasks.length}</span>
        </h2>
      </button>

      {open && (
        <div>
          {tasks.map((task, i) => {
            const completedDate = task.completed_at
              ? new Date(task.completed_at).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                })
              : null;

            return (
              <div
                key={task.id}
                className="flex items-center"
                style={{
                  gap: "var(--space-3)",
                  paddingTop: "var(--space-3)",
                  paddingBottom: "var(--space-3)",
                  borderTop: i > 0 ? "1px solid var(--rule-soft)" : undefined,
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

                {completedDate && (
                  <span
                    className="flex-shrink-0 tnum"
                    style={{ fontSize: "var(--t-micro)", color: "var(--color-text-faint)" }}
                  >
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
