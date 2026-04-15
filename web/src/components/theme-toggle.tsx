"use client";

import { useEffect, useState, useTransition } from "react";
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
  const [mounted, setMounted] = useState(false);
  const [, startTransition] = useTransition();

  useEffect(() => setMounted(true), []);

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
      aria-label={mounted ? `Theme: ${LABEL[current]}. Click to change.` : "Theme toggle"}
      title={mounted ? `Theme: ${LABEL[current]}` : undefined}
      className="flex items-center justify-center rounded-md transition-colors cursor-pointer"
      style={{
        width: 32,
        height: 32,
        background: "transparent",
        color: "var(--color-text-muted)",
        border: "1px solid var(--color-border)",
      }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = "var(--color-text)"; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = "var(--color-text-muted)"; }}
    >
      <Icon size={15} />
    </button>
  );
}
