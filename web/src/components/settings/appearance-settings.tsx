"use client";

import { useEffect, useState, useTransition } from "react";
import { useTheme } from "next-themes";
import { setThemePreference } from "@/lib/theme-actions";
import type { ThemePreference } from "@/lib/theme";

const OPTIONS: { value: ThemePreference; label: string; desc: string }[] = [
  { value: "system", label: "Auto",  desc: "Match your device setting" },
  { value: "light",  label: "Light", desc: "Light mode always" },
  { value: "dark",   label: "Dark",  desc: "Dark mode always" },
];

export function AppearanceSettings() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [, startTransition] = useTransition();

  useEffect(() => setMounted(true), []);

  const current = (theme as ThemePreference | undefined) ?? "system";
  const active = OPTIONS.find((o) => o.value === current) ?? OPTIONS[0];

  function handleChange(value: ThemePreference) {
    setTheme(value);
    startTransition(() => {
      setThemePreference(value);
    });
  }

  return (
    <section
      aria-labelledby="appearance-heading"
      style={{
        paddingTop: "var(--space-6)",
        paddingBottom: "var(--space-6)",
        borderBottom: "1px solid var(--rule-soft)",
      }}
    >
      <h2 id="appearance-heading" className="db-section-label">
        Appearance
      </h2>

      <div
        className="flex flex-wrap items-center"
        style={{ gap: "var(--space-4)" }}
        role="radiogroup"
        aria-label="Theme preference"
      >
        <div
          className="flex items-center p-0.5"
          style={{
            background: "transparent",
            border: "1px solid var(--rule)",
            borderRadius: "var(--r-1)",
            gap: 2,
          }}
        >
          {OPTIONS.map((opt) => {
            const selected = mounted && current === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => handleChange(opt.value)}
                style={{
                  fontFamily: "var(--font-body), system-ui, sans-serif",
                  fontSize: "var(--t-micro)",
                  fontWeight: 500,
                  letterSpacing: "0.02em",
                  padding: "0 var(--space-3)",
                  minHeight: 44,
                  minWidth: 64,
                  background: selected ? "var(--accent)" : "transparent",
                  color: selected ? "var(--color-text-on-cta)" : "var(--color-text-muted)",
                  border: "none",
                  borderRadius: "var(--r-1)",
                  cursor: "pointer",
                  transition:
                    "background var(--motion-fast) var(--ease-out-quart), color var(--motion-fast) var(--ease-out-quart)",
                }}
              >
                {opt.label}
              </button>
            );
          })}
        </div>

        <span
          style={{
            fontSize: "var(--t-micro)",
            color: "var(--color-text-faint)",
          }}
          aria-live="polite"
        >
          {mounted ? active.desc : "\u00A0"}
        </span>
      </div>
    </section>
  );
}
