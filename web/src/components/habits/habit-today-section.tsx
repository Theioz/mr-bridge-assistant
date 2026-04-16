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

  const completed = habits.filter((h) => todayLogMap.get(h.id)?.completed).length;

  return (
    <section>
      <div
        className="flex items-center justify-between"
        style={{ marginBottom: "var(--space-3)" }}
      >
        <h2 className="db-section-label" style={{ margin: 0 }}>
          Today
          <span className="meta tnum">· {completed}/{habits.length}</span>
        </h2>
        <div className="flex items-center" style={{ gap: "var(--space-1)" }}>
          <button
            onClick={() => {
              setManageMode((m) => !m);
              setShowAdd(false);
            }}
            className="cursor-pointer"
            style={{
              background: manageMode ? "var(--color-surface-raised)" : "transparent",
              color: manageMode ? "var(--color-text)" : "var(--color-text-muted)",
              border: "none",
              borderRadius: "var(--r-1)",
              fontSize: "var(--t-micro)",
              minHeight: 44,
              padding: "0 var(--space-3)",
              transition: "background var(--motion-fast) var(--ease-out-quart), color var(--motion-fast) var(--ease-out-quart)",
            }}
          >
            Manage
          </button>
          <button
            onClick={() => {
              setShowAdd((s) => !s);
              setManageMode(false);
            }}
            className="cursor-pointer"
            style={{
              background: showAdd ? "var(--color-surface-raised)" : "transparent",
              color: showAdd ? "var(--color-text)" : "var(--color-text-muted)",
              border: "none",
              borderRadius: "var(--r-1)",
              fontSize: "var(--t-micro)",
              minHeight: 44,
              padding: "0 var(--space-3)",
              transition: "background var(--motion-fast) var(--ease-out-quart), color var(--motion-fast) var(--ease-out-quart)",
            }}
          >
            + Add
          </button>
        </div>
      </div>

      <div>
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
          <p
            style={{
              fontSize: "var(--t-body)",
              color: "var(--color-text-faint)",
              padding: "var(--space-4) 0",
            }}
          >
            No habits configured.
          </p>
        )}
      </div>

      {showAdd && (
        <div
          className="flex flex-wrap items-center"
          style={{
            gap: "var(--space-2)",
            padding: "var(--space-3) 0",
            marginTop: "var(--space-2)",
            borderTop: "1px solid var(--rule-soft)",
          }}
          data-disabled={isPending || undefined}
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
              {emoji || <Smile className="w-4 h-4" aria-hidden />}
            </button>
            {showEmojiPicker && (
              <div className="absolute left-0 top-12 z-50">
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
            className="flex-1 input-focus-ring"
            style={{
              minWidth: 120,
              minHeight: 44,
              padding: "0 var(--space-3)",
              fontSize: "var(--t-meta)",
              borderRadius: "var(--r-1)",
              background: "transparent",
              color: "var(--color-text)",
              border: "1px solid var(--rule)",
            }}
          />
          <input
            type="text"
            placeholder="Category"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
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
          />
          <div className="basis-full">
            <HabitIconPicker value={iconKey} onChange={setIconKey} />
          </div>
          <button
            onClick={handleAdd}
            disabled={!name.trim() || isPending}
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
            onClick={handleCancel}
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
      )}
    </section>
  );
}
