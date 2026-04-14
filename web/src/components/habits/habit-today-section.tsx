"use client";

import { useState, useTransition, useRef, useEffect } from "react";
import dynamic from "next/dynamic";
import HabitToggle from "./habit-toggle";
import type { HabitRegistry, HabitLog } from "@/lib/types";
import type { EmojiClickData } from "emoji-picker-react";

const EmojiPicker = dynamic(() => import("emoji-picker-react"), { ssr: false });

interface Props {
  habits: HabitRegistry[];
  todayLogs: HabitLog[];
  date: string;
  toggleAction: (habitId: string, date: string, completed: boolean) => Promise<void>;
  archiveAction: (habitId: string) => Promise<void>;
  addAction: (name: string, emoji: string, category: string) => Promise<void>;
  updateAction: (id: string, name: string, emoji: string, category: string) => Promise<void>;
}

export default function HabitTodaySection({
  habits,
  todayLogs,
  date,
  toggleAction,
  archiveAction,
  addAction,
  updateAction,
}: Props) {
  const todayLogMap = new Map(todayLogs.map((l) => [l.habit_id, l]));

  const [manageMode, setManageMode] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [name, setName] = useState("");
  const [emoji, setEmoji] = useState("");
  const [category, setCategory] = useState("");
  const [isPending, startTransition] = useTransition();
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

  function handleAdd() {
    if (!name.trim()) return;
    startTransition(async () => {
      await addAction(name, emoji, category);
      setName("");
      setEmoji("");
      setCategory("");
      setShowAdd(false);
    });
  }

  function handleCancel() {
    setName("");
    setEmoji("");
    setCategory("");
    setShowAdd(false);
  }

  return (
    <section>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-xs text-neutral-500 uppercase tracking-wide">Today</h2>
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              setManageMode((m) => !m);
              setShowAdd(false);
            }}
            className={`text-xs px-2 py-0.5 rounded transition-colors ${
              manageMode
                ? "bg-neutral-700 text-neutral-200"
                : "text-neutral-500 hover:text-neutral-300"
            }`}
          >
            Manage
          </button>
          <button
            onClick={() => {
              setShowAdd((s) => !s);
              setManageMode(false);
            }}
            className={`text-xs px-2 py-0.5 rounded transition-colors ${
              showAdd
                ? "bg-neutral-700 text-neutral-200"
                : "text-neutral-500 hover:text-neutral-300"
            }`}
          >
            + Add
          </button>
        </div>
      </div>

      <div className="divide-y divide-neutral-800/50">
        {habits.map((habit) => (
          <HabitToggle
            key={habit.id}
            habit={habit}
            log={todayLogMap.get(habit.id)}
            toggleAction={toggleAction}
            date={date}
            manageMode={manageMode}
            archiveAction={archiveAction}
            updateAction={updateAction}
          />
        ))}
        {habits.length === 0 && !showAdd && (
          <p className="text-sm text-neutral-600 py-4">No habits configured.</p>
        )}
      </div>

      {showAdd && (
        <div className="mt-3 flex flex-wrap items-center gap-2 py-3 border-t border-neutral-800/50">
          <div className="relative" ref={pickerRef}>
            <button
              type="button"
              onClick={() => setShowEmojiPicker((v) => !v)}
              className="w-10 h-8 bg-neutral-800 text-neutral-100 text-lg rounded flex items-center justify-center focus:outline-none focus:ring-1 focus:ring-neutral-600"
              title="Pick emoji"
            >
              {emoji || "😀"}
            </button>
            {showEmojiPicker && (
              <div className="absolute left-0 top-10 z-50">
                <EmojiPicker
                  onEmojiClick={(data: EmojiClickData) => {
                    setEmoji(data.emoji);
                    setShowEmojiPicker(false);
                  }}
                  width={300}
                  height={400}
                  searchDisabled={false}
                  skinTonesDisabled
                  previewConfig={{ showPreview: false }}
                />
              </div>
            )}
          </div>
          <input
            type="text"
            placeholder="Habit name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="flex-1 min-w-[120px] bg-neutral-800 text-neutral-100 text-sm rounded px-2 py-1.5 placeholder-neutral-600 focus:outline-none focus:ring-1 focus:ring-neutral-600"
          />
          <input
            type="text"
            placeholder="Category"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="w-28 bg-neutral-800 text-neutral-100 text-sm rounded px-2 py-1.5 placeholder-neutral-600 focus:outline-none focus:ring-1 focus:ring-neutral-600"
          />
          <button
            onClick={handleAdd}
            disabled={!name.trim() || isPending}
            className="text-xs px-3 py-1.5 bg-neutral-700 text-neutral-100 rounded hover:bg-neutral-600 disabled:opacity-40 transition-colors"
          >
            Save
          </button>
          <button
            onClick={handleCancel}
            className="text-xs px-2 py-1.5 text-neutral-500 hover:text-neutral-300 transition-colors"
          >
            Cancel
          </button>
        </div>
      )}
    </section>
  );
}
