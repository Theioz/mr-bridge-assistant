"use client";

import Link from "next/link";

export const SETTINGS_TABS = [
  { key: "profile", label: "Profile" },
  { key: "fitness", label: "Fitness" },
  { key: "integrations", label: "Integrations" },
  { key: "watchlists", label: "Watchlists" },
  { key: "appearance", label: "Appearance" },
] as const;

export type SettingsTab = (typeof SETTINGS_TABS)[number]["key"];

const VALID_KEYS = new Set<string>(SETTINGS_TABS.map((t) => t.key));

export function isSettingsTab(value: string | undefined): value is SettingsTab {
  return typeof value === "string" && VALID_KEYS.has(value);
}

interface Props {
  activeTab: SettingsTab;
}

export function SettingsTabs({ activeTab }: Props) {
  return (
    <nav
      aria-label="Settings sections"
      style={{
        overflowX: "auto",
        WebkitOverflowScrolling: "touch",
        scrollbarWidth: "none",
        borderBottom: "1px solid var(--rule-soft)",
        marginBottom: "var(--space-6)",
      }}
    >
      <style>{`nav::-webkit-scrollbar { display: none }`}</style>
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
                color: active ? "var(--color-primary)" : "var(--color-text-muted)",
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
