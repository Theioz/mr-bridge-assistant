"use client";

import { useTransition } from "react";
import { setWindowPreference } from "@/lib/window-actions";
import type { WindowKey } from "@/lib/window";

const WINDOWS: { key: WindowKey; label: string }[] = [
  { key: "7d",  label: "7D" },
  { key: "14d", label: "14D" },
  { key: "30d", label: "30D" },
  { key: "90d", label: "90D" },
  { key: "1yr", label: "1Y" },
];

interface Props {
  current: WindowKey;
}

export function WindowSelector({ current }: Props) {
  const [, startTransition] = useTransition();

  function select(key: WindowKey) {
    startTransition(() => {
      setWindowPreference(key);
    });
  }

  return (
    <div
      className="flex items-center gap-0.5 p-0.5"
      style={{
        background: "transparent",
        border: "1px solid var(--rule)",
        borderRadius: "var(--r-1)",
      }}
    >
      {WINDOWS.map(({ key, label }) => {
        const active = key === current;
        return (
          <button
            key={key}
            onClick={() => select(key)}
            className="px-3 rounded-md text-xs font-medium cursor-pointer flex items-center justify-center"
            style={{
              background: active ? "var(--accent)" : "transparent",
              color: active ? "var(--color-text-on-cta)" : "var(--color-text-muted)",
              minHeight: 44,
              minWidth: 44,
              transition: "background var(--motion-fast) var(--ease-out-quart), color var(--motion-fast) var(--ease-out-quart)",
            }}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
