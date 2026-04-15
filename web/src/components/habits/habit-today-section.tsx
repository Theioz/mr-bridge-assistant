"use client";

import { useState, useTransition, useRef, useEffect } from "react";
import dynamic from "next/dynamic";
import { Smile } from "lucide-react";
import HabitToggle from "./habit-toggle";
import HabitIconPicker from "./habit-icon-picker";
import type { HabitRegistry, HabitLog } from "@/lib/types";
import type { EmojiClickData } from "emoji-picker-react";

const EmojiPicker = dynamic(() => import("emoji-picker-react"), { ssr: false });

interface Props {
  habits: HabitRegistry[];
  todayLogs: HabitLog[];
  date: string;
  toggleAction: (habitId: string, date: string, completed: boolean) => Promise<void>;
  archiveAction: (habitId: string) => Promise<void>;
  addAction: (name: string, emoji: string, category: string, iconKey: string) => Promise<void>;
  updateAction: (id: string, name: string, emoji: string, category: string, iconKey: string) => Promise<void>;
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
  const [iconKey, setIconKey] = useState("target");
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
      await addAction(name, emoji, category, iconKey);
      setName("");
      setEmoji("");
      setCategory("");
      setIconKey("target");
      setShowAdd(false);
    });
  }

  function handleCancel() {
    setName("");
    setEmoji("");
    setCategory("");
    setIconKey("target");
    setShowAdd(false);
  }

  return (
    <section>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-xs uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>Today</h2>
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              setManageMode((m) => !m);
              setShowAdd(false);
            }}
            className="text-xs px-2 py-0.5 rounded transition-colors cursor-pointer"
            style={{
              background: manageMode ? "var(--color-surface-raised)" : "transparent",
              color: manageMode ? "var(--color-text)" : "var(--color-text-muted)",
              border: "none",
            }}
          >
            Manage
          </button>
          <button
            onClick={() => {
              setShowAdd((s) => !s);
              setManageMode(false);
            }}
            className="text-xs px-2 py-0.5 rounded transition-colors cursor-pointer"
            style={{
              background: showAdd ? "var(--color-surface-raised)" : "transparent",
              color: showAdd ? "var(--color-text)" : "var(--color-text-muted)",
              border: "none",
            }}
          >
            + Add
          </button>
        </div>
      </div>

      <div className="divide-y" style={{ borderColor: "var(--color-border)" }}>
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
          <p className="text-sm py-4" style={{ color: "var(--color-text-faint)" }}>No habits configured.</p>
        )}
      </div>

      {showAdd && (
        <div className="mt-3 flex flex-wrap items-center gap-2 py-3" style={{ borderTop: "1px solid var(--color-border)" }}>
          <div className="relative" ref={pickerRef}>
            <button
              type="button"
              onClick={() => setShowEmojiPicker((v) => !v)}
              className="w-10 h-8 text-lg rounded flex items-center justify-center cursor-pointer"
              style={{ background: "var(--color-surface-raised)", color: "var(--color-text)", border: "1px solid var(--color-border)" }}
              title="Pick emoji"
            >
              {emoji || <Smile className="w-4 h-4" aria-hidden />}
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
            className="flex-1 min-w-[120px] text-sm rounded px-2 py-1.5"
            style={{ background: "var(--color-surface-raised)", color: "var(--color-text)", border: "1px solid var(--color-border)" }}
          />
          <input
            type="text"
            placeholder="Category"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="w-28 text-sm rounded px-2 py-1.5"
            style={{ background: "var(--color-surface-raised)", color: "var(--color-text)", border: "1px solid var(--color-border)" }}
          />
          <div className="basis-full">
            <HabitIconPicker value={iconKey} onChange={setIconKey} />
          </div>
          <button
            onClick={handleAdd}
            disabled={!name.trim() || isPending}
            className="text-xs px-3 py-1.5 rounded disabled:opacity-40 transition-colors cursor-pointer"
            style={{ background: "var(--color-primary)", color: "var(--color-text-on-cta)", border: "none" }}
          >
            Save
          </button>
          <button
            onClick={handleCancel}
            className="text-xs px-2 py-1.5 transition-colors cursor-pointer"
            style={{ color: "var(--color-text-muted)", background: "transparent", border: "none" }}
          >
            Cancel
          </button>
        </div>
      )}
    </section>
  );
}
