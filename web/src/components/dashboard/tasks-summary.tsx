import Link from "next/link";
import { ListTodo } from "lucide-react";
import EmptyState from "./empty-state";
import type { Task } from "@/lib/types";

interface Props {
  tasks: Task[];
}

const PRIORITY_ORDER = { high: 0, medium: 1, low: 2 } as const;

const PRIORITY_COLOR: Record<string, string> = {
  high:   "var(--color-danger)",
  medium: "var(--color-warning)",
  low:    "var(--color-text-faint)",
};

export default function TasksSummary({ tasks }: Props) {
  const high   = tasks.filter((t) => t.priority === "high").length;
  const medium = tasks.filter((t) => t.priority === "medium").length;
  const low    = tasks.filter((t) => t.priority === "low").length;

  const topTasks = [...tasks].sort(
    (a, b) =>
      (PRIORITY_ORDER[a.priority ?? "low"] ?? 2) -
      (PRIORITY_ORDER[b.priority ?? "low"] ?? 2)
  );

  return (
    <Link
      href="/tasks"
      className="block rounded-xl p-4 transition-all duration-200 card-lift"
      style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)" }}
    >
      <p
        className="text-xs uppercase tracking-widest mb-3"
        style={{ color: "var(--color-text-muted)", letterSpacing: "0.07em" }}
      >
        Active tasks
      </p>

      {/* Count + breakdown */}
      <div className="flex items-baseline gap-3">
        <p className="font-heading font-bold" style={{ fontSize: 28, color: "var(--color-text)" }}>
          {tasks.length}
        </p>
        {tasks.length > 0 && (
          <div className="flex gap-2 text-xs" style={{ color: "var(--color-text-muted)" }}>
            {high   > 0 && <span><span style={{ color: "var(--color-danger)"  }}>{high}</span> high</span>}
            {medium > 0 && <span><span style={{ color: "var(--color-warning)" }}>{medium}</span> med</span>}
            {low    > 0 && <span><span style={{ color: "var(--color-text-muted)" }}>{low}</span> low</span>}
          </div>
        )}
      </div>

      {/* All tasks with inner scroll */}
      {topTasks.length > 0 && (
        <div className="mt-3 space-y-1.5 overflow-y-auto scroll-fade-mask" style={{ maxHeight: 160 }}>
          {topTasks.map((t) => {
            const dot = PRIORITY_COLOR[t.priority ?? "low"] ?? PRIORITY_COLOR.low;
            return (
              <div key={t.id} className="flex items-center gap-2 min-w-0">
                <span
                  className="flex-shrink-0 rounded-full"
                  style={{ width: 5, height: 5, background: dot }}
                />
                <p className="text-xs truncate flex-1" style={{ color: "var(--color-text-muted)" }}>
                  {t.title}
                </p>
                {t.due_date && (
                  <span className="text-xs flex-shrink-0" style={{ color: "var(--color-text-faint)" }}>
                    {t.due_date.slice(5).replace("-", "/")}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}

      {tasks.length === 0 && (
        <div className="mt-2">
          <EmptyState icon={ListTodo} paddingY={8}>No active tasks</EmptyState>
        </div>
      )}
    </Link>
  );
}
