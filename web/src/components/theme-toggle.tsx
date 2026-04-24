"use client";

import { useSyncExternalStore, useTransition } from "react";
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

// Mount flag via external-store read — matches the pattern in
// appearance-settings.tsx. Avoids the react-hooks@7 `set-state-in-effect`
// lint rule that blocks the classic `useState(false) + useEffect(setTrue)`.
const subscribeMounted = () => () => {};
const getMountedSnapshot = () => true;
const getMountedServerSnapshot = () => false;

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [, startTransition] = useTransition();

  // next-themes reads from localStorage on the client, which may disagree with
  // the cookie-backed defaultTheme the server rendered with. Gate the
  // theme-dependent label/icon behind mount so SSR and the first client render
  // both produce the same placeholder.
  const mounted = useSyncExternalStore(
    subscribeMounted,
    getMountedSnapshot,
    getMountedServerSnapshot,
  );

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
      aria-label={mounted ? `Theme: ${LABEL[current]}. Click to change.` : "Theme"}
      title={mounted ? `Theme: ${LABEL[current]}` : undefined}
      className="flex items-center justify-center rounded-md cursor-pointer hover-text-brighten"
      style={{
        width: 32,
        height: 32,
        background: "transparent",
        color: "var(--color-text-muted)",
        border: "1px solid var(--color-border)",
        transition:
          "color var(--motion-fast) var(--ease-out-quart), background-color var(--motion-fast) var(--ease-out-quart), border-color var(--motion-fast) var(--ease-out-quart)",
      }}
    >
      {mounted ? (
        <Icon size={15} />
      ) : (
        <span aria-hidden style={{ width: 15, height: 15, display: "inline-block" }} />
      )}
    </button>
  );
}
