"use client";

import { useEffect, useState, useTransition } from "react";
import { useTheme } from "next-themes";
import { setThemePreference } from "@/lib/theme-actions";
import type { ThemePreference } from "@/lib/theme";

const OPTIONS: { value: ThemePreference; label: string; desc: string }[] = [
  { value: "system", label: "System", desc: "Match your device setting" },
  { value: "light",  label: "Light",  desc: "Light mode always" },
  { value: "dark",   label: "Dark",   desc: "Dark mode always" },
];

export function AppearanceSettings() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [, startTransition] = useTransition();

  useEffect(() => setMounted(true), []);

  const current = (theme as ThemePreference | undefined) ?? "system";

  function handleChange(value: ThemePreference) {
    setTheme(value);
    startTransition(() => {
      setThemePreference(value);
    });
  }

  return (
    <div
      className="rounded-xl p-5"
      style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)" }}
    >
      <p
        className="text-xs uppercase tracking-widest mb-4"
        style={{ color: "var(--color-text-muted)", letterSpacing: "0.07em" }}
      >
        Appearance
      </p>
      <fieldset className="space-y-2" aria-label="Theme preference">
        {OPTIONS.map((opt) => {
          const selected = mounted && current === opt.value;
          return (
            <label
              key={opt.value}
              className="flex items-start gap-3 px-3 py-2.5 rounded-lg cursor-pointer transition-colors"
              style={{
                background: selected ? "var(--color-primary-dim)" : "transparent",
                border: `1px solid ${selected ? "var(--color-primary)" : "var(--color-border)"}`,
              }}
            >
              <input
                type="radio"
                name="theme_preference"
                value={opt.value}
                checked={selected}
                onChange={() => handleChange(opt.value)}
                style={{ marginTop: 3, accentColor: "var(--color-primary)" }}
              />
              <span className="flex-1">
                <span className="block text-sm font-medium" style={{ color: "var(--color-text)" }}>
                  {opt.label}
                </span>
                <span className="block text-xs mt-0.5" style={{ color: "var(--color-text-muted)" }}>
                  {opt.desc}
                </span>
              </span>
            </label>
          );
        })}
      </fieldset>
    </div>
  );
}
