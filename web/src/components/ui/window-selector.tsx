"use client";

import { useRouter } from "next/navigation";
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
  const router = useRouter();

  function select(key: WindowKey) {
    document.cookie = `mb-window=${key}; path=/; max-age=31536000; SameSite=Lax`;
    router.refresh();
  }

  return (
    <div
      className="flex items-center gap-0.5 p-0.5 rounded-lg"
      style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)" }}
    >
      {WINDOWS.map(({ key, label }) => {
        const active = key === current;
        return (
          <button
            key={key}
            onClick={() => select(key)}
            className="px-2.5 py-1 rounded-md text-xs font-medium transition-all duration-150 cursor-pointer"
            style={{
              background: active ? "var(--color-primary)" : "transparent",
              color: active ? "#fff" : "var(--color-text-muted)",
            }}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
