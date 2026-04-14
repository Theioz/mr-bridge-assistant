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
  updateAction?: (id: string, name: string, emoji: string, category: string) => Promise<void>;
}

export default function HabitToggle({
  habit,
  log,
  toggleAction,
  date,
  manageMode,
  archiveAction,
  updateAction,
}: Props) {
  const [optimistic, setOptimistic] = useState<boolean | undefined>(log?.completed);
  const [isPending, startTransition] = useTransition();
  const [archivePending, startArchiveTransition] = useTransition();
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(habit.name);
  const [editEmoji, setEditEmoji] = useState(habit.emoji ?? "");
  const [editCategory, setEditCategory] = useState(habit.category ?? "");
  const [editPending, startEditTransition] = useTransition();

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
    <div className={`flex items-center ${isPending || archivePending || editPending ? "opacity-60" : ""}`}>
      {editing ? (
        <div className="flex-1 flex flex-wrap items-center gap-2 py-2 px-1">
          <input
            type="text"
            value={editEmoji}
            onChange={(e) => setEditEmoji(e.target.value)}
            maxLength={4}
            className="w-10 bg-neutral-800 text-neutral-100 text-sm rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-neutral-600"
            placeholder="😀"
          />
          <input
            type="text"
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            className="flex-1 min-w-[100px] bg-neutral-800 text-neutral-100 text-sm rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-neutral-600"
            placeholder="Habit name"
          />
          <input
            type="text"
            value={editCategory}
            onChange={(e) => setEditCategory(e.target.value)}
            className="w-24 bg-neutral-800 text-neutral-100 text-sm rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-neutral-600"
            placeholder="Category"
          />
          <button
            disabled={!editName.trim() || editPending}
            onClick={() => {
              startEditTransition(async () => {
                await updateAction?.(habit.id, editName, editEmoji, editCategory);
                setEditing(false);
              });
            }}
            className="text-xs px-2 py-1 bg-neutral-700 text-neutral-100 rounded hover:bg-neutral-600 disabled:opacity-40"
          >
            Save
          </button>
          <button
            onClick={() => {
              setEditName(habit.name);
              setEditEmoji(habit.emoji ?? "");
              setEditCategory(habit.category ?? "");
              setEditing(false);
            }}
            className="text-xs px-2 py-1 text-neutral-500 hover:text-neutral-300"
          >
            Cancel
          </button>
        </div>
      ) : (
        <>
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
          {manageMode ? (
            <>
              {updateAction && (
                <button
                  onClick={() => setEditing(true)}
                  disabled={archivePending}
                  className="ml-1 text-xs text-neutral-600 hover:text-neutral-300 px-1 py-3 transition-colors disabled:opacity-40"
                  title="Edit habit"
                >
                  Edit
                </button>
              )}
              {archiveAction && (
                <button
                  onClick={handleArchive}
                  disabled={archivePending}
                  className="ml-1 text-xs text-neutral-600 hover:text-red-400 px-1 py-3 transition-colors disabled:opacity-40"
                  title="Archive habit"
                >
                  ✕
                </button>
              )}
            </>
          ) : null}
        </>
      )}
    </div>
  );
}
