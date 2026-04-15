"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";

export type ChartColors = {
  primary: string;
  secondary: string;
  positive: string;
  warning: string;
  danger: string;
  info: string;
  cta: string;
  text: string;
  textMuted: string;
  textFaint: string;
  border: string;
  surface: string;
  surfaceRaised: string;
  grid: string;
  axis: string;
  tooltipBg: string;
  tooltipBorder: string;
};

const KEYS: Record<keyof ChartColors, string> = {
  primary:       "--color-primary",
  secondary:     "--color-secondary",
  positive:      "--color-positive",
  warning:       "--color-warning",
  danger:        "--color-danger",
  info:          "--color-info",
  cta:           "--color-cta",
  text:          "--color-text",
  textMuted:     "--color-text-muted",
  textFaint:     "--color-text-faint",
  border:        "--color-border",
  surface:       "--color-surface",
  surfaceRaised: "--color-surface-raised",
  grid:          "--color-border",
  axis:          "--color-text-faint",
  tooltipBg:     "--color-surface-raised",
  tooltipBorder: "--color-border",
};

const FALLBACK_DARK: ChartColors = {
  primary: "#3B82F6",
  secondary: "#60A5FA",
  positive: "#10B981",
  warning: "#F59E0B",
  danger: "#EF4444",
  info: "#38BDF8",
  cta: "#F59E0B",
  text: "#F8FAFC",
  textMuted: "#94A3B8",
  textFaint: "#64748B",
  border: "#1F2937",
  surface: "#111827",
  surfaceRaised: "#181B24",
  grid: "#1F2937",
  axis: "#64748B",
  tooltipBg: "#181B24",
  tooltipBorder: "#1F2937",
};

function readColors(): ChartColors {
  if (typeof window === "undefined") return FALLBACK_DARK;
  const styles = getComputedStyle(document.documentElement);
  const out = {} as ChartColors;
  (Object.keys(KEYS) as (keyof ChartColors)[]).forEach((k) => {
    const v = styles.getPropertyValue(KEYS[k]).trim();
    out[k] = v || FALLBACK_DARK[k];
  });
  return out;
}

export function useChartColors(): ChartColors {
  const { resolvedTheme } = useTheme();
  const [colors, setColors] = useState<ChartColors>(FALLBACK_DARK);

  useEffect(() => {
    setColors(readColors());
  }, [resolvedTheme]);

  return colors;
}
