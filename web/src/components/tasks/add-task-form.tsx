"use client";

import { useState, useTransition, useRef } from "react";
import { Plus } from "lucide-react";

interface Props {
  addAction: (title: string, priority: string, dueDate: string) => Promise<{ error?: string }>;
}

const PRIORITIES = [
  { key: "high",   label: "High",   color: "var(--accent)" },
  { key: "medium", label: "Medium", color: "var(--color-text-muted)" },
  { key: "low",    label: "Low",    color: "var(--color-text-faint)" },
] as const;

export default function AddTaskForm({ addAction }: Props) {
  const [title, setTitle]          = useState("");
  const [priority, setPriority]    = useState<"high" | "medium" | "low">("medium");
  const [dueDate, setDueDate]      = useState("");
  const [error, setError]          = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  function handleSubmit(e?: React.FormEvent) {
    e?.preventDefault();
    if (!title.trim() || isPending) return;
    setError(null);
    startTransition(async () => {
      const result = await addAction(title.trim(), priority, dueDate);
      if (result.error) { setError(result.error); return; }
      setTitle("");
      setPriority("medium");
      setDueDate("");
      inputRef.current?.focus();
    });
  }

  return (
    <form
      onSubmit={handleSubmit}
      style={{
        background: "transparent",
        borderBottom: "1px solid var(--rule)",
      }}
    >
      <div
        className="flex items-center flex-wrap sm:flex-nowrap"
        style={{
          gap: "var(--space-3)",
          paddingTop: "var(--space-3)",
          paddingBottom: "var(--space-3)",
        }}
      >
        <Plus size={16} style={{ color: "var(--accent)", flexShrink: 0 }} aria-hidden />

        <input
          ref={inputRef}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") handleSubmit(); }}
          placeholder="Add a task…"
          className="flex-1 bg-transparent focus:outline-none min-w-0"
          style={{
            color: "var(--color-text)",
            fontSize: "var(--t-body)",
            caretColor: "var(--accent)",
          }}
        />

        {/* Priority dot selector */}
        <div className="flex items-center flex-shrink-0" style={{ gap: "var(--space-1)" }} title="Priority">
          {PRIORITIES.map(({ key, label, color }) => (
            <button
              key={key}
              type="button"
              onClick={() => setPriority(key)}
              className="flex items-center justify-center transition-opacity hover:opacity-80"
              style={{ width: 32, height: 32, borderRadius: "50%" }}
              title={label}
            >
              <span
                className="rounded-full block"
                style={{
                  width: 12,
                  height: 12,
                  border: `1.5px solid ${color}`,
                  background: priority === key ? color : "transparent",
                  transition: "background var(--motion-fast) var(--ease-out-quart)",
                }}
              />
            </button>
          ))}
        </div>

        <input
          type="date"
          aria-label="Due date"
          value={dueDate}
          onChange={(e) => setDueDate(e.target.value)}
          className="focus:outline-none flex-shrink-0"
          style={{
            fontSize: "var(--t-micro)",
            background: "transparent",
            border: "1px solid var(--rule)",
            borderRadius: "var(--r-1)",
            padding: "4px 8px",
            color: dueDate ? "var(--color-text)" : "var(--color-text-faint)",
            width: 120,
          }}
        />

        <button
          type="submit"
          disabled={!title.trim() || isPending}
          className="flex-shrink-0 transition-opacity disabled:opacity-30 hover:opacity-80"
          style={{
            fontSize: "var(--t-micro)",
            fontWeight: 500,
            background: "var(--accent)",
            color: "var(--color-text-on-cta)",
            borderRadius: "var(--r-1)",
            padding: "6px 12px",
          }}
        >
          {isPending ? "…" : "Add"}
        </button>
      </div>

      {error && (
        <p
          style={{
            fontSize: "var(--t-micro)",
            color: "var(--color-danger)",
            paddingBottom: "var(--space-3)",
          }}
        >
          {error}
        </p>
      )}
    </form>
  );
}
