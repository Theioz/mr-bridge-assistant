import Link from "next/link";
import type { Task } from "@/lib/types";

interface Props {
  tasks: Task[];
}

export default function TasksSummary({ tasks }: Props) {
  const high = tasks.filter((t) => t.priority === "high").length;
  const medium = tasks.filter((t) => t.priority === "medium").length;
  const low = tasks.filter((t) => t.priority === "low").length;

  return (
    <Link href="/tasks" className="block bg-neutral-900 rounded-xl p-4 border border-neutral-800 hover:border-neutral-700 transition-colors">
      <p className="text-xs text-neutral-500 uppercase tracking-wide mb-3">Active tasks</p>
      <p className="text-2xl font-semibold text-neutral-100">{tasks.length}</p>
      {tasks.length > 0 && (
        <div className="mt-3 flex gap-3 text-xs text-neutral-500">
          {high > 0 && <span><span className="text-red-400">{high}</span> high</span>}
          {medium > 0 && <span><span className="text-yellow-400">{medium}</span> med</span>}
          {low > 0 && <span><span className="text-neutral-400">{low}</span> low</span>}
        </div>
      )}
    </Link>
  );
}
