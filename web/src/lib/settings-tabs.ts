// The one list of Settings tabs. A plain module (no "use client") so the server page can
// validate ?tab= with it and the client tab bar can render it. Importing isSettingsTab from the
// client component instead crashed every Settings tab on the server (#761).

export const SETTINGS_TABS = [
  { key: "profile", label: "Profile" },
  { key: "fitness", label: "Fitness" },
  { key: "integrations", label: "Integrations" },
  { key: "watchlists", label: "Watchlists" },
  { key: "appearance", label: "Appearance" },
  { key: "data", label: "Data" },
  { key: "status", label: "Status" },
] as const;

export type SettingsTab = (typeof SETTINGS_TABS)[number]["key"];

const VALID_KEYS = new Set<string>(SETTINGS_TABS.map((t) => t.key));

export function isSettingsTab(value: string | undefined): value is SettingsTab {
  return typeof value === "string" && VALID_KEYS.has(value);
}
