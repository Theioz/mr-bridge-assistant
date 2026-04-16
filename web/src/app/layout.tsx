import type { Metadata, Viewport } from "next";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { ServiceWorkerRegister } from "@/components/service-worker-register";
import { getServerThemePreference } from "@/lib/theme";

export const metadata: Metadata = {
  title: {
    default: "Mr. Bridge",
    template: "%s · Mr. Bridge",
  },
  description: "Personal assistant dashboard",
  manifest: "/manifest.json",
};

export const viewport: Viewport = {
  viewportFit: "cover",
  themeColor: "#0B0F19",
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const themePref = await getServerThemePreference();
  const htmlThemeAttr =
    themePref === "light" || themePref === "dark" ? { "data-theme": themePref } : {};

  return (
    <html lang="en" suppressHydrationWarning {...htmlThemeAttr}>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Inter:wght@300;400;500;600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body style={{ background: "var(--color-bg)", color: "var(--color-text)" }}>
        <ThemeProvider defaultTheme={themePref}>{children}</ThemeProvider>
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
