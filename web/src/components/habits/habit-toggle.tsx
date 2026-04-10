"use client";

import { useState, useTransition } from "react";
import type { HabitRegistry, HabitLog } from "@/lib/types";

interface Props {
  habit: HabitRegistry;
  log: HabitLog | undefined;
  toggleAction: (habitId: string, date: string, completed: boolean) => Promise<void>;
  date: string;
}

export default function HabitToggle({ habit, log, toggleAction, date }: Props) {
  const [optimistic, setOptimistic] = useState<boolean | undefined>(log?.completed);
  const [isPending, startTransition] = useTransition();

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

  return (
    <button
      onClick={handleToggle}
      disabled={isPending}
      className="w-full flex items-center gap-3 py-3 px-1 text-left hover:bg-neutral-800/50 rounded-lg transition-colors disabled:opacity-60"
    >
      <span
        className={`w-5 h-5 rounded-md border flex items-center justify-center flex-shrink-0 transition-colors ${
          completed
            ? "bg-neutral-100 border-neutral-100"
            : "border-neutral-600"
        }`}
      >
        {completed && (
          <svg className="w-3 h-3 text-neutral-950" viewBox="0 0 12 12" fill="none">
            <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </span>
      <span className="text-lg leading-none">{habit.emoji}</span>
      <span className={`text-sm ${completed ? "text-neutral-500 line-through" : "text-neutral-200"}`}>
        {habit.name}
      </span>
      {habit.category && (
        <span className="ml-auto text-xs text-neutral-600">{habit.category}</span>
      )}
    </button>
  );
}
