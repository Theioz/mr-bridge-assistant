"use client";

import { useState, useTransition, useRef } from "react";
import { Plus } from "lucide-react";

interface Props {
  addAction: (title: string, priority: string, dueDate: string) => Promise<{ error?: string }>;
}

export default function AddTaskForm({ addAction }: Props) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [priority, setPriority] = useState("medium");
  const [dueDate, setDueDate] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  function handleOpen() {
    setOpen(true);
    setTimeout(() => inputRef.current?.focus(), 50);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setError(null);
    startTransition(async () => {
      const result = await addAction(title.trim(), priority, dueDate);
      if (result.error) {
        setError(result.error);
        return;
      }
      setTitle("");
      setPriority("medium");
      setDueDate("");
      setOpen(false);
    });
  }

  if (!open) {
    return (
      <button
        onClick={handleOpen}
        className="flex items-center gap-2 text-sm text-neutral-500 hover:text-neutral-300 transition-colors py-2"
      >
        <Plus size={16} />
        Add task
      </button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="bg-neutral-900 border border-neutral-700 rounded-xl p-4 space-y-3">
      <input
        ref={inputRef}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Task title"
        className="w-full bg-transparent text-sm text-neutral-100 placeholder-neutral-600 focus:outline-none"
        required
      />
      <div className="flex gap-2">
        <select
          value={priority}
          onChange={(e) => setPriority(e.target.value)}
          className="bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-1.5 text-xs text-neutral-300 focus:outline-none"
        >
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
        <input
          type="date"
          value={dueDate}
          onChange={(e) => setDueDate(e.target.value)}
          className="bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-1.5 text-xs text-neutral-300 focus:outline-none flex-1"
        />
      </div>
      {error && (
        <p className="text-xs text-red-400">{error}</p>
      )}
      <div className="flex gap-2 justify-end">
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="px-3 py-1.5 text-xs text-neutral-500 hover:text-neutral-300 transition-colors"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={isPending || !title.trim()}
          className="px-3 py-1.5 text-xs bg-blue-500 text-white rounded-lg font-medium disabled:opacity-40 hover:bg-blue-400 transition-colors"
        >
          {isPending ? "Adding..." : "Add"}
        </button>
      </div>
    </form>
  );
}
