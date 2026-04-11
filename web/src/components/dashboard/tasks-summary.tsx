import Link from "next/link";
import type { Task } from "@/lib/types";

interface Props {
  tasks: Task[];
}

const PRIORITY_ORDER = { high: 0, medium: 1, low: 2 } as const;

function priorityBorder(priority: Task["priority"]): string {
  if (priority === "high") return "border-l-red-500";
  if (priority === "medium") return "border-l-yellow-500";
  return "border-l-neutral-600";
}

function priorityText(priority: Task["priority"]): string {
  if (priority === "high") return "text-red-400";
  if (priority === "medium") return "text-yellow-400";
  return "text-neutral-500";
}

export default function TasksSummary({ tasks }: Props) {
  const high = tasks.filter((t) => t.priority === "high").length;
  const medium = tasks.filter((t) => t.priority === "medium").length;
  const low = tasks.filter((t) => t.priority === "low").length;

  const sorted = [...tasks].sort(
    (a, b) =>
      (PRIORITY_ORDER[a.priority ?? "low"] ?? 2) -
      (PRIORITY_ORDER[b.priority ?? "low"] ?? 2)
  );
  const topTasks = sorted.slice(0, 3);

  return (
    <Link href="/tasks" className="block bg-neutral-900 rounded-xl p-4 border border-neutral-800 hover:border-neutral-700 transition-colors">
      <p className="text-xs text-neutral-500 uppercase tracking-wide mb-3">Active tasks</p>

      {/* Count + priority breakdown */}
      <div className="flex items-baseline gap-3">
        <p className="text-2xl font-semibold font-[family-name:var(--font-mono)] text-neutral-100">{tasks.length}</p>
        {tasks.length > 0 && (
          <div className="flex gap-2 text-xs text-neutral-500">
            {high > 0 && <span><span className="text-red-400">{high}</span> high</span>}
            {medium > 0 && <span><span className="text-yellow-400">{medium}</span> med</span>}
            {low > 0 && <span><span className="text-neutral-400">{low}</span> low</span>}
          </div>
        )}
      </div>

      {/* Top 3 tasks */}
      {topTasks.length > 0 && (
        <div className="mt-3 space-y-1.5">
          {topTasks.map((t) => (
            <div
              key={t.id}
              className={`flex items-center gap-2 border-l-2 pl-2 ${priorityBorder(t.priority)}`}
            >
              <p className="text-xs text-neutral-300 truncate flex-1">{t.title}</p>
              {t.due_date && (
                <span className={`text-[10px] shrink-0 ${priorityText(t.priority)}`}>
                  {t.due_date.slice(5)}
                </span>
              )}
            </div>
          ))}
          {tasks.length > 3 && (
            <p className="text-xs text-neutral-600 pl-2">+{tasks.length - 3} more</p>
          )}
        </div>
      )}
    </Link>
  );
}
