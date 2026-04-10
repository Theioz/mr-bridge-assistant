"use client";

import { useTransition } from "react";
import { Check, Archive } from "lucide-react";
import type { Task } from "@/lib/types";

const priorityConfig = {
  high: { color: "bg-red-400", label: "High" },
  medium: { color: "bg-yellow-400", label: "Med" },
  low: { color: "bg-neutral-500", label: "Low" },
};

interface Props {
  task: Task;
  completeAction: (id: string) => Promise<void>;
  archiveAction: (id: string) => Promise<void>;
}

export default function TaskItem({ task, completeAction, archiveAction }: Props) {
  const [isPending, startTransition] = useTransition();

  const priority = task.priority ? priorityConfig[task.priority] : null;

  return (
    <div className={`flex items-start gap-3 py-3 px-1 ${isPending ? "opacity-40" : ""} transition-opacity`}>
      <div className="flex-1 min-w-0 mt-0.5">
        <div className="flex items-center gap-2">
          {priority && (
            <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${priority.color}`} />
          )}
          <p className="text-sm text-neutral-200 truncate">{task.title}</p>
        </div>
        {(task.due_date || task.category) && (
          <p className="text-xs text-neutral-600 mt-0.5 ml-3.5">
            {task.category && <span>{task.category}</span>}
            {task.category && task.due_date && <span> · </span>}
            {task.due_date && <span>Due {task.due_date}</span>}
          </p>
        )}
      </div>
      <div className="flex gap-1 flex-shrink-0">
        <button
          onClick={() => startTransition(() => completeAction(task.id))}
          disabled={isPending}
          title="Complete"
          className="p-1.5 rounded-lg text-neutral-500 hover:text-green-400 hover:bg-neutral-800 transition-colors"
        >
          <Check size={15} />
        </button>
        <button
          onClick={() => startTransition(() => archiveAction(task.id))}
          disabled={isPending}
          title="Archive"
          className="p-1.5 rounded-lg text-neutral-500 hover:text-neutral-300 hover:bg-neutral-800 transition-colors"
        >
          <Archive size={15} />
        </button>
      </div>
    </div>
  );
}
