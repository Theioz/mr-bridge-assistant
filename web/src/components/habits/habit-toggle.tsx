"use client";

import { useState, useTransition, useRef, useEffect } from "react";
import dynamic from "next/dynamic";
import type { HabitRegistry, HabitLog } from "@/lib/types";
import type { EmojiClickData } from "emoji-picker-react";

const EmojiPicker = dynamic(() => import("emoji-picker-react"), { ssr: false });

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
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showEmojiPicker) return;
    function handleClickOutside(e: MouseEvent) {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setShowEmojiPicker(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showEmojiPicker]);

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
          <div className="relative" ref={pickerRef}>
            <button
              type="button"
              onClick={() => setShowEmojiPicker((v) => !v)}
              className="w-10 h-8 text-lg rounded flex items-center justify-center cursor-pointer"
              style={{ background: "var(--color-surface-raised)", color: "var(--color-text)", border: "1px solid var(--color-border)" }}
              title="Pick emoji"
            >
              {editEmoji || "😀"}
            </button>
            {showEmojiPicker && (
              <div className="absolute left-0 top-10 z-50">
                <EmojiPicker
                  onEmojiClick={(data: EmojiClickData) => {
                    setEditEmoji(data.emoji);
                    setShowEmojiPicker(false);
                  }}
                  width={300}
                  height={400}
                  skinTonesDisabled
                  previewConfig={{ showPreview: false }}
                />
              </div>
            )}
          </div>
          <input
            type="text"
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            className="flex-1 min-w-[100px] text-sm rounded px-2 py-1"
            style={{ background: "var(--color-surface-raised)", color: "var(--color-text)", border: "1px solid var(--color-border)" }}
            placeholder="Habit name"
          />
          <input
            type="text"
            value={editCategory}
            onChange={(e) => setEditCategory(e.target.value)}
            className="w-24 text-sm rounded px-2 py-1"
            style={{ background: "var(--color-surface-raised)", color: "var(--color-text)", border: "1px solid var(--color-border)" }}
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
            className="text-xs px-2 py-1 rounded disabled:opacity-40 cursor-pointer"
            style={{ background: "var(--color-primary)", color: "var(--color-text-on-cta)" }}
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
            className="text-xs px-2 py-1 cursor-pointer"
            style={{ color: "var(--color-text-muted)", background: "transparent", border: "none" }}
          >
            Cancel
          </button>
        </div>
      ) : (
        <>
          <button
            onClick={handleToggle}
            disabled={isPending || archivePending}
            className="flex-1 flex items-center gap-3 py-3 px-1 text-left rounded-lg transition-colors cursor-pointer"
          >
            <span
              className="w-5 h-5 rounded-md border flex items-center justify-center flex-shrink-0 transition-colors"
              style={{
                background: completed ? "var(--color-primary)" : "transparent",
                borderColor: completed ? "var(--color-primary)" : "var(--color-border)",
              }}
            >
              {completed && (
                <svg className="w-3 h-3" viewBox="0 0 12 12" fill="none" style={{ color: "var(--color-text-on-cta)" }}>
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
              className="text-sm"
              style={{
                color: completed ? "var(--color-text-muted)" : "var(--color-text)",
                textDecoration: completed ? "line-through" : "none",
              }}
            >
              {habit.name}
            </span>
            {!manageMode && habit.category && (
              <span className="ml-auto text-xs" style={{ color: "var(--color-text-faint)" }}>{habit.category}</span>
            )}
          </button>
          {manageMode ? (
            <>
              {updateAction && (
                <button
                  onClick={() => setEditing(true)}
                  disabled={archivePending}
                  className="ml-1 text-xs px-1 py-3 transition-colors disabled:opacity-40 cursor-pointer"
                  style={{ color: "var(--color-text-muted)", background: "transparent", border: "none" }}
                  title="Edit habit"
                >
                  Edit
                </button>
              )}
              {archiveAction && (
                <button
                  onClick={handleArchive}
                  disabled={archivePending}
                  className="ml-1 text-xs px-1 py-3 transition-colors disabled:opacity-40 cursor-pointer"
                  style={{ color: "var(--color-danger)", background: "transparent", border: "none" }}
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
