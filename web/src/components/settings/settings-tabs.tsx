"use client";

import Link from "next/link";
import { SETTINGS_TABS, type SettingsTab } from "@/lib/settings-tabs";

export type { SettingsTab } from "@/lib/settings-tabs";

interface Props {
  activeTab: SettingsTab;
}

export function SettingsTabs({ activeTab }: Props) {
  return (
    <nav
      aria-label="Settings sections"
      className="settings-nav"
      style={{
        overflowX: "auto",
        WebkitOverflowScrolling: "touch",
        scrollbarWidth: "none",
        borderBottom: "1px solid var(--rule-soft)",
        marginBottom: "var(--space-6)",
      }}
    >
      <div className="flex" style={{ minWidth: "max-content", paddingInlineEnd: "var(--space-4)" }}>
        {SETTINGS_TABS.map(({ key, label }) => {
          const active = key === activeTab;
          return (
            <Link
              key={key}
              href={`/settings?tab=${key}`}
              aria-current={active ? "page" : undefined}
              style={{
                display: "inline-flex",
                alignItems: "center",
                padding: "0 var(--space-4)",
                minHeight: 44,
                fontSize: "var(--t-meta)",
                fontWeight: active ? 600 : 400,
                color: active ? "var(--color-text)" : "var(--color-text-muted)",
                borderBottom: active ? "2px solid var(--color-primary)" : "2px solid transparent",
                textDecoration: "none",
                whiteSpace: "nowrap",
                transition:
                  "color var(--motion-fast) var(--ease-out-quart), border-color var(--motion-fast) var(--ease-out-quart)",
              }}
            >
              {label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
