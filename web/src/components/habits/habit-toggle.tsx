"use client";

import { useState, useTransition, useRef, useEffect } from "react";
import dynamic from "next/dynamic";
import { Smile } from "lucide-react";
import type { HabitRegistry, HabitLog } from "@/lib/types";
import type { EmojiClickData } from "emoji-picker-react";
import { getHabitIcon } from "@/lib/habit-icons";
import HabitIconPicker from "./habit-icon-picker";

const EmojiPicker = dynamic(() => import("emoji-picker-react"), { ssr: false });

interface Props {
  habit: HabitRegistry;
  log: HabitLog | undefined;
  toggleAction: (habitId: string, date: string, completed: boolean) => Promise<void>;
  date: string;
  manageMode?: boolean;
  archiveAction?: (habitId: string) => Promise<void>;
  updateAction?: (id: string, name: string, emoji: string, category: string, iconKey: string) => Promise<void>;
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
  const [editIconKey, setEditIconKey] = useState(habit.icon_key ?? "target");
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
  const pending = isPending || archivePending || editPending;

  function handleToggle() {
    const next = !completed;
    setOptimistic(next);
    startTransition(async () => {
      try {
        await toggleAction(habit.id, date, next);
      } catch {
        setOptimistic(completed);
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
    <div
      className="db-row"
      style={{
        gridTemplateColumns: "1fr auto",
        alignItems: "center",
        padding: 0,
        opacity: pending ? 0.6 : 1,
      }}
    >
      {editing ? (
        <div
          className="flex flex-wrap items-center"
          style={{ gap: "var(--space-2)", padding: "var(--space-3) 0", gridColumn: "1 / -1" }}
        >
          <div className="relative" ref={pickerRef}>
            <button
              type="button"
              onClick={() => setShowEmojiPicker((v) => !v)}
              className="flex items-center justify-center cursor-pointer"
              style={{
                width: 44,
                height: 44,
                fontSize: "var(--t-body)",
                borderRadius: "var(--r-1)",
                background: "transparent",
                color: "var(--color-text)",
                border: "1px solid var(--rule)",
              }}
              title="Pick emoji"
            >
              {editEmoji || <Smile className="w-4 h-4" aria-hidden />}
            </button>
            {showEmojiPicker && (
              <div className="absolute left-0 top-12 z-50">
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
            className="flex-1 input-focus-ring"
            style={{
              minWidth: 100,
              minHeight: 44,
              padding: "0 var(--space-3)",
              fontSize: "var(--t-meta)",
              borderRadius: "var(--r-1)",
              background: "transparent",
              color: "var(--color-text)",
              border: "1px solid var(--rule)",
            }}
            placeholder="Habit name"
          />
          <input
            type="text"
            value={editCategory}
            onChange={(e) => setEditCategory(e.target.value)}
            className="input-focus-ring"
            style={{
              width: 140,
              minHeight: 44,
              padding: "0 var(--space-3)",
              fontSize: "var(--t-meta)",
              borderRadius: "var(--r-1)",
              background: "transparent",
              color: "var(--color-text)",
              border: "1px solid var(--rule)",
            }}
            placeholder="Category"
          />
          <div className="basis-full">
            <HabitIconPicker value={editIconKey} onChange={setEditIconKey} />
          </div>
          <button
            disabled={!editName.trim() || editPending}
            onClick={() => {
              startEditTransition(async () => {
                await updateAction?.(habit.id, editName, editEmoji, editCategory, editIconKey);
                setEditing(false);
              });
            }}
            className="cursor-pointer disabled:opacity-40"
            style={{
              fontSize: "var(--t-micro)",
              minHeight: 44,
              padding: "0 var(--space-4)",
              borderRadius: "var(--r-1)",
              background: "var(--accent)",
              color: "var(--color-text-on-cta)",
              border: "none",
            }}
          >
            Save
          </button>
          <button
            onClick={() => {
              setEditName(habit.name);
              setEditEmoji(habit.emoji ?? "");
              setEditCategory(habit.category ?? "");
              setEditIconKey(habit.icon_key ?? "target");
              setEditing(false);
            }}
            className="cursor-pointer hover-text-brighten"
            style={{
              fontSize: "var(--t-micro)",
              minHeight: 44,
              padding: "0 var(--space-3)",
              color: "var(--color-text-muted)",
              background: "transparent",
              border: "none",
            }}
          >
            Cancel
          </button>
        </div>
      ) : (
        <>
          <button
            onClick={handleToggle}
            disabled={isPending || archivePending}
            aria-checked={completed}
            role="checkbox"
            className="hover-bg-subtle"
            style={{
              display: "grid",
              gridTemplateColumns: "auto auto auto 1fr auto",
              alignItems: "center",
              gap: "var(--space-3)",
              width: "100%",
              minHeight: 44,
              padding: "var(--space-3) 0",
              background: "transparent",
              border: 0,
              textAlign: "left",
              cursor: isPending ? "wait" : "pointer",
              transition: "background var(--motion-fast) var(--ease-out-quart)",
            }}
          >
            <span
              aria-hidden
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
                width: 20,
                height: 20,
                borderRadius: "var(--r-1)",
                border: completed ? "none" : "1px solid var(--color-text-faint)",
                background: completed ? "var(--accent)" : "transparent",
                transition:
                  "background var(--motion-fast) var(--ease-out-quart), border-color var(--motion-fast) var(--ease-out-quart)",
              }}
            >
              {completed && (
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <path
                    d="M2 6l3 3 5-5"
                    stroke="var(--color-text-on-cta)"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              )}
            </span>
            {(() => {
              const Icon = getHabitIcon(habit);
              return (
                <Icon
                  className="w-4 h-4"
                  style={{ color: "var(--color-text-faint)", flexShrink: 0 }}
                  aria-hidden
                />
              );
            })()}
            {habit.emoji ? (
              <span
                style={{ fontSize: "var(--t-body)", lineHeight: 1, flexShrink: 0 }}
                aria-hidden="true"
              >
                {habit.emoji}
              </span>
            ) : (
              <span />
            )}
            <span
              style={{
                fontSize: "var(--t-body)",
                color: completed ? "var(--color-text-faint)" : "var(--color-text)",
                textDecoration: completed ? "line-through" : "none",
                minWidth: 0,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {habit.name}
            </span>
            {!manageMode && habit.category && (
              <span
                style={{
                  fontSize: "var(--t-micro)",
                  color: "var(--color-text-faint)",
                  letterSpacing: "0.02em",
                }}
              >
                {habit.category}
              </span>
            )}
          </button>
          {manageMode && (
            <div className="flex items-center" style={{ gap: "var(--space-1)" }}>
              {updateAction && (
                <button
                  onClick={() => setEditing(true)}
                  disabled={archivePending}
                  className="cursor-pointer hover-text-brighten disabled:opacity-40"
                  style={{
                    fontSize: "var(--t-micro)",
                    minHeight: 44,
                    padding: "0 var(--space-3)",
                    color: "var(--color-text-muted)",
                    background: "transparent",
                    border: "none",
                  }}
                  title="Edit habit"
                >
                  Edit
                </button>
              )}
              {archiveAction && (
                <button
                  onClick={handleArchive}
                  disabled={archivePending}
                  className="cursor-pointer hover-text-danger disabled:opacity-40"
                  style={{
                    fontSize: "var(--t-micro)",
                    minHeight: 44,
                    minWidth: 44,
                    padding: "0 var(--space-3)",
                    color: "var(--color-text-muted)",
                    background: "transparent",
                    border: "none",
                  }}
                  title="Archive habit"
                >
                  ✕
                </button>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
