"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";
import type { ThemePreference } from "@/lib/theme";

export function ThemeProvider({
  children,
  defaultTheme,
}: {
  children: React.ReactNode;
  defaultTheme: ThemePreference;
}) {
  return (
    <NextThemesProvider
      attribute="data-theme"
      defaultTheme={defaultTheme}
      enableSystem
      disableTransitionOnChange
    >
      {children}
    </NextThemesProvider>
  );
}
