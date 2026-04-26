"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";
import type { ThemePreference } from "@/lib/theme";

export function ThemeProvider({
  children,
  defaultTheme,
  nonce,
}: {
  children: React.ReactNode;
  defaultTheme: ThemePreference;
  nonce?: string;
}) {
  return (
    <NextThemesProvider
      attribute="data-theme"
      defaultTheme={defaultTheme}
      enableSystem
      disableTransitionOnChange
      nonce={nonce}
    >
      {children}
    </NextThemesProvider>
  );
}
