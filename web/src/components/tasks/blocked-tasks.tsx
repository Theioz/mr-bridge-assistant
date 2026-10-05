"use client";

import { useState, type ReactNode } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";

/**
 * Tasks waiting on another active task (#470). Collapsed by default: they are not actionable yet,
 * so they stay out of the priority groups until the blocker is done. The rows themselves are
 * ordinary TaskItems, rendered on the server and passed in as children.
 */
export default function BlockedTasks({ count, children }: { count: number; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <section style={{ paddingTop: "var(--space-6)" }}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center transition-opacity hover:opacity-80"
        style={{
          gap: "var(--space-2)",
          color: "var(--color-text-faint)",
          marginBottom: "var(--space-2)",
        }}
        aria-expanded={open}
      >
        {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        <h2 className="db-section-label" style={{ margin: 0 }}>
          Blocked
          <span className="meta">· {count}</span>
        </h2>
      </button>
      {open && <div>{children}</div>}
    </section>
  );
}
