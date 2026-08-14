"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, X, Check } from "lucide-react";
import type { TaskList } from "@/lib/types";

interface Props {
  lists: TaskList[];
  selected: string; // "all" | "none" | <listId>
  counts: Record<string, number>;
  createAction: (name: string) => Promise<{ error?: string; id?: string }>;
  renameAction: (id: string, name: string) => Promise<{ error?: string }>;
  deleteAction: (id: string) => Promise<{ error?: string }>;
}

export default function ListTabs({
  lists,
  selected,
  counts,
  createAction,
  renameAction,
  deleteAction,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const [error, setError] = useState<string | null>(null);

  function go(key: string) {
    startTransition(() => {
      router.push(key === "all" ? "/tasks" : `/tasks?list=${encodeURIComponent(key)}`);
    });
  }

  function submitCreate() {
    const name = newName.trim();
    if (!name) return;
    setError(null);
    startTransition(async () => {
      const res = await createAction(name);
      if (res.error) {
        setError(res.error);
        return;
      }
      setNewName("");
      setCreating(false);
      if (res.id) router.push(`/tasks?list=${encodeURIComponent(res.id)}`);
    });
  }

  const activeList = lists.find((l) => l.id === selected);

  function submitRename() {
    const name = renameValue.trim();
    if (!activeList || !name || name === activeList.name) {
      setRenaming(false);
      return;
    }
    setError(null);
    startTransition(async () => {
      const res = await renameAction(activeList.id, name);
      if (res.error) setError(res.error);
      setRenaming(false);
    });
  }

  function handleDelete() {
    if (!activeList) return;
    startTransition(async () => {
      const res = await deleteAction(activeList.id);
      if (res.error) {
        setError(res.error);
        return;
      }
      router.push("/tasks");
    });
  }

  const tabs: { key: string; label: string }[] = [
    { key: "all", label: "All" },
    ...lists.map((l) => ({ key: l.id, label: l.name })),
  ];
  // Only surface the "Uncategorised" tab when there is something in it.
  if ((counts.none ?? 0) > 0) tabs.push({ key: "none", label: "Uncategorised" });

  return (
    <div style={{ marginBottom: "var(--space-3)", opacity: isPending ? 0.6 : 1 }}>
      <div
        className="flex items-center no-scrollbar"
        style={{ gap: "var(--space-2)", overflowX: "auto", paddingBottom: 2 }}
      >
        {tabs.map(({ key, label }) => {
          const active = selected === key;
          const list = lists.find((l) => l.id === key);
          const count = counts[key] ?? 0;
          return (
            <button
              key={key}
              type="button"
              onClick={() => go(key)}
              className="flex items-center flex-shrink-0 transition-opacity hover:opacity-80"
              style={{
                gap: "var(--space-1)",
                fontSize: "var(--t-micro)",
                fontWeight: active ? 600 : 400,
                color: active ? "var(--color-text-on-cta)" : "var(--color-text-muted)",
                background: active ? "var(--accent)" : "var(--color-surface-raised, transparent)",
                border: "1px solid var(--rule)",
                borderRadius: 999,
                padding: "4px 10px",
                whiteSpace: "nowrap",
              }}
            >
              {list && (
                <span
                  className="rounded-full block"
                  style={{
                    width: 7,
                    height: 7,
                    background: list.color ?? "var(--color-text-faint)",
                    flexShrink: 0,
                  }}
                  aria-hidden
                />
              )}
              {label}
              {count > 0 && <span className="tnum meta">· {count}</span>}
            </button>
          );
        })}

        {/* New list */}
        {creating ? (
          <div className="flex items-center flex-shrink-0" style={{ gap: 4 }}>
            <input
              autoFocus
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") submitCreate();
                if (e.key === "Escape") {
                  setCreating(false);
                  setNewName("");
                }
              }}
              placeholder="List name…"
              className="focus:outline-none"
              style={{
                fontSize: "var(--t-micro)",
                background: "transparent",
                border: "1px solid var(--rule)",
                borderRadius: 999,
                padding: "4px 10px",
                color: "var(--color-text)",
                width: 120,
              }}
            />
            <button
              type="button"
              onClick={submitCreate}
              className="p-1 transition-opacity hover:opacity-70"
              style={{ color: "var(--accent)" }}
              title="Create list"
            >
              <Check size={14} />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="flex items-center flex-shrink-0 transition-opacity hover:opacity-80"
            style={{
              gap: 3,
              fontSize: "var(--t-micro)",
              color: "var(--color-text-faint)",
              border: "1px dashed var(--rule)",
              borderRadius: 999,
              padding: "4px 10px",
              whiteSpace: "nowrap",
            }}
            title="New list"
          >
            <Plus size={12} />
            List
          </button>
        )}
      </div>

      {/* Manage row for the selected list — rename / delete */}
      {activeList && (
        <div
          className="flex items-center flex-wrap"
          style={{ gap: "var(--space-2)", marginTop: "var(--space-2)" }}
        >
          {renaming ? (
            <>
              <input
                autoFocus
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") submitRename();
                  if (e.key === "Escape") setRenaming(false);
                }}
                className="focus:outline-none"
                style={{
                  fontSize: "var(--t-micro)",
                  background: "transparent",
                  border: "1px solid var(--rule)",
                  borderRadius: "var(--r-1)",
                  padding: "3px 8px",
                  color: "var(--color-text)",
                }}
              />
              <button
                type="button"
                onClick={submitRename}
                className="transition-opacity hover:opacity-80"
                style={{
                  fontSize: "var(--t-micro)",
                  fontWeight: 500,
                  background: "var(--accent)",
                  color: "var(--color-text-on-cta)",
                  borderRadius: "var(--r-1)",
                  padding: "3px 8px",
                }}
              >
                Save
              </button>
              <button
                type="button"
                onClick={() => setRenaming(false)}
                className="p-1 transition-opacity hover:opacity-70"
                style={{ color: "var(--color-text-faint)" }}
                title="Cancel"
              >
                <X size={12} />
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => {
                  setRenameValue(activeList.name);
                  setRenaming(true);
                }}
                className="transition-opacity hover:opacity-70"
                style={{ fontSize: "var(--t-micro)", color: "var(--color-text-muted)" }}
              >
                Rename
              </button>
              <span style={{ color: "var(--rule)" }}>·</span>
              <button
                type="button"
                onClick={handleDelete}
                className="transition-opacity hover:opacity-70"
                style={{ fontSize: "var(--t-micro)", color: "var(--color-danger)" }}
                title="Delete list (tasks move to Uncategorised)"
              >
                Delete list
              </button>
            </>
          )}
        </div>
      )}

      {error && (
        <p style={{ fontSize: "var(--t-micro)", color: "var(--color-danger)", marginTop: 4 }}>
          {error}
        </p>
      )}
    </div>
  );
}
