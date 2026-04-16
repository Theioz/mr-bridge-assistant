import type { Metadata, Viewport } from "next";
import { Mona_Sans, Hubot_Sans } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { ServiceWorkerRegister } from "@/components/service-worker-register";
import { getServerThemePreference } from "@/lib/theme";

const monaSans = Mona_Sans({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-body",
  weight: "variable",
});

const hubotSans = Hubot_Sans({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-display",
  weight: "variable",
});

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
    <html
      lang="en"
      suppressHydrationWarning
      className={`${monaSans.variable} ${hubotSans.variable}`}
      {...htmlThemeAttr}
    >
      <body style={{ background: "var(--color-bg)", color: "var(--color-text)" }}>
        <ThemeProvider defaultTheme={themePref}>{children}</ThemeProvider>
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
