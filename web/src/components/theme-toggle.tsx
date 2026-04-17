"use client";

import { useTransition } from "react";
import { useTheme } from "next-themes";
import { Sun, Moon, Monitor } from "lucide-react";
import { setThemePreference } from "@/lib/theme-actions";
import type { ThemePreference } from "@/lib/theme";

const CYCLE: ThemePreference[] = ["system", "light", "dark"];

const LABEL: Record<ThemePreference, string> = {
  system: "System",
  light: "Light",
  dark: "Dark",
};

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [, startTransition] = useTransition();

  const current: ThemePreference = (theme as ThemePreference | undefined) ?? "system";
  const Icon = current === "light" ? Sun : current === "dark" ? Moon : Monitor;

  function handleClick() {
    const idx = CYCLE.indexOf(current);
    const next = CYCLE[(idx + 1) % CYCLE.length];
    setTheme(next);
    startTransition(() => {
      setThemePreference(next);
    });
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-label={`Theme: ${LABEL[current]}. Click to change.`}
      title={`Theme: ${LABEL[current]}`}
      className="flex items-center justify-center rounded-md cursor-pointer hover-text-brighten"
      style={{
        width: 32,
        height: 32,
        background: "transparent",
        color: "var(--color-text-muted)",
        border: "1px solid var(--color-border)",
        transition: "color var(--motion-fast) var(--ease-out-quart), background-color var(--motion-fast) var(--ease-out-quart), border-color var(--motion-fast) var(--ease-out-quart)",
      }}
    >
      <Icon size={15} />
    </button>
  );
}
