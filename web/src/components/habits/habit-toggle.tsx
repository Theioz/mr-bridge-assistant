"use client";

import { useState, useTransition } from "react";
import type { HabitRegistry, HabitLog } from "@/lib/types";

interface Props {
  habit: HabitRegistry;
  log: HabitLog | undefined;
  toggleAction: (habitId: string, date: string, completed: boolean) => Promise<void>;
  date: string;
  manageMode?: boolean;
  archiveAction?: (habitId: string) => Promise<void>;
}

export default function HabitToggle({
  habit,
  log,
  toggleAction,
  date,
  manageMode,
  archiveAction,
}: Props) {
  const [optimistic, setOptimistic] = useState<boolean | undefined>(log?.completed);
  const [isPending, startTransition] = useTransition();
  const [archivePending, startArchiveTransition] = useTransition();

  const completed = optimistic ?? false;

  function handleToggle() {
    const next = !completed;
    setOptimistic(next);
    startTransition(async () => {
      try {
        await toggleAction(habit.id, date, next);
      } catch {
        setOptimistic(completed); // revert on error
      }
    });
  }

  function handleArchive() {
    if (!archiveAction) return;
    startArchiveTransition(async () => {
      await archiveAction(habit.id);
    });
  }

  return (
    <div className={`flex items-center ${isPending || archivePending ? "opacity-60" : ""}`}>
      <button
        onClick={handleToggle}
        disabled={isPending || archivePending}
        className="flex-1 flex items-center gap-3 py-3 px-1 text-left hover:bg-neutral-800/50 rounded-lg transition-colors"
      >
        <span
          className={`w-5 h-5 rounded-md border flex items-center justify-center flex-shrink-0 transition-colors ${
            completed ? "bg-blue-500 border-blue-500" : "border-neutral-600"
          }`}
        >
          {completed && (
            <svg className="w-3 h-3 text-white" viewBox="0 0 12 12" fill="none">
              <path
                d="M2 6l3 3 5-5"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          )}
        </span>
        <span className="text-lg leading-none">{habit.emoji}</span>
        <span
          className={`text-sm ${completed ? "text-neutral-500 line-through" : "text-neutral-200"}`}
        >
          {habit.name}
        </span>
        {!manageMode && habit.category && (
          <span className="ml-auto text-xs text-neutral-600">{habit.category}</span>
        )}
      </button>
      {manageMode && archiveAction ? (
        <button
          onClick={handleArchive}
          disabled={archivePending}
          className="ml-2 text-xs text-neutral-600 hover:text-red-400 px-1 py-3 transition-colors disabled:opacity-40"
          title="Archive habit"
        >
          ✕
        </button>
      ) : null}
    </div>
  );
}
