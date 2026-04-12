"use client";

import { useState, useTransition, useRef } from "react";
import { Plus } from "lucide-react";

interface Props {
  addAction: (title: string, priority: string, dueDate: string) => Promise<{ error?: string }>;
}

const PRIORITIES = [
  { key: "high",   color: "var(--color-danger)"  },
  { key: "medium", color: "var(--color-warning)"  },
  { key: "low",    color: "var(--color-text-faint)" },
] as const;

export default function AddTaskForm({ addAction }: Props) {
  const [title, setPriority_title] = useState("");
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
      setPriority_title("");
      setPriority("medium");
      setDueDate("");
      inputRef.current?.focus();
    });
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-xl overflow-hidden"
      style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)" }}
    >
      <div className="flex items-center gap-3 px-4 py-3 flex-wrap sm:flex-nowrap">
        {/* Plus icon */}
        <Plus size={16} style={{ color: "var(--color-primary)", flexShrink: 0 }} />

        {/* Title */}
        <input
          ref={inputRef}
          value={title}
          onChange={(e) => setPriority_title(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") handleSubmit(); }}
          placeholder="Add a task..."
          className="flex-1 bg-transparent text-sm focus:outline-none min-w-0"
          style={{ color: "var(--color-text)" }}
        />

        {/* Priority dot selector */}
        <div className="flex items-center gap-1.5 flex-shrink-0" title="Priority">
          {PRIORITIES.map(({ key, color }) => (
            <button
              key={key}
              type="button"
              onClick={() => setPriority(key)}
              className="flex items-center justify-center transition-all"
              style={{ width: 32, height: 32, borderRadius: "50%" }}
              title={key.charAt(0).toUpperCase() + key.slice(1)}
            >
              <span
                className="rounded-full border-2 block transition-all"
                style={{
                  width: 14,
                  height: 14,
                  borderColor: color,
                  background: priority === key ? color : "transparent",
                }}
              />
            </button>
          ))}
        </div>

        {/* Due date */}
        <input
          type="date"
          value={dueDate}
          onChange={(e) => setDueDate(e.target.value)}
          className="text-xs focus:outline-none rounded-lg px-2 py-1 flex-shrink-0"
          style={{
            background: "var(--color-surface-raised)",
            border: "1px solid var(--color-border)",
            color: dueDate ? "var(--color-text-muted)" : "var(--color-text-faint)",
            width: 112,
          }}
        />

        {/* Submit */}
        <button
          type="submit"
          disabled={!title.trim() || isPending}
          className="flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium transition-opacity disabled:opacity-30"
          style={{ background: "var(--color-primary)", color: "#fff" }}
        >
          {isPending ? "…" : "Add"}
        </button>
      </div>

      {error && (
        <p className="px-4 pb-3 text-xs" style={{ color: "var(--color-danger)" }}>
          {error}
        </p>
      )}
    </form>
  );
}
