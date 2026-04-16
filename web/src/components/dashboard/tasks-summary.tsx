import Link from "next/link";
import { ListTodo } from "lucide-react";
import EmptyState from "./empty-state";
import type { Task } from "@/lib/types";

interface Props {
  tasks: Task[];
}

const PRIORITY_ORDER = { high: 0, medium: 1, low: 2 } as const;

export default function TasksSummary({ tasks }: Props) {
  const topTasks = [...tasks].sort(
    (a, b) =>
      (PRIORITY_ORDER[a.priority ?? "low"] ?? 2) -
      (PRIORITY_ORDER[b.priority ?? "low"] ?? 2)
  );

  return (
    <section>
      <h2 className="db-section-label">
        Tasks
        {tasks.length > 0 && <span className="meta">· {tasks.length} active</span>}
      </h2>

      {topTasks.length > 0 ? (
        <ul
          className="scroll-fade-mask"
          style={{
            listStyle: "none",
            margin: 0,
            padding: 0,
            maxHeight: 240,
            overflowY: "auto",
          }}
        >
          {topTasks.map((t) => {
            const attn = t.priority === "high";
            return (
              <li
                key={t.id}
                className="db-row"
                style={{ gridTemplateColumns: "auto 1fr auto", fontSize: "var(--t-body)" }}
              >
                <span
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: 999,
                    background: attn ? "var(--accent)" : "var(--color-text-faint)",
                    alignSelf: "center",
                  }}
                  aria-hidden
                />
                <Link
                  href="/tasks"
                  style={{
                    color: "var(--color-text)",
                    textDecoration: "none",
                    minWidth: 0,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {t.title}
                </Link>
                {t.due_date && (
                  <span
                    className="tnum"
                    style={{
                      fontSize: "var(--t-micro)",
                      color: "var(--color-text-faint)",
                    }}
                  >
                    {t.due_date.slice(5).replace("-", "/")}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      ) : (
        <EmptyState icon={ListTodo} paddingY={16}>No active tasks</EmptyState>
      )}
    </section>
  );
}
