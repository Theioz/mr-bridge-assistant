"use client";

import { useState, useTransition } from "react";
import HabitToggle from "./habit-toggle";
import HabitIconPicker from "./habit-icon-picker";
import type { HabitRegistry, HabitLog } from "@/lib/types";

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
  const [category, setCategory] = useState("");
  const [iconKey, setIconKey] = useState("target");
  const [isPending, startTransition] = useTransition();

  function handleAdd() {
    if (!name.trim()) return;
    startTransition(async () => {
      // `emoji` arg preserved for server-action compatibility; always empty
      // now that the picker is retired in favor of the lucide-only icon set.
      await addAction(name, "", category, iconKey);
      setName("");
      setCategory("");
      setIconKey("target");
      setShowAdd(false);
    });
  }

  function handleCancel() {
    setName("");
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
