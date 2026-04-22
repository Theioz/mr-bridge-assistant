import { cookies } from "next/headers";

export type WindowKey = "7d" | "14d" | "30d" | "90d" | "1yr";

export const WINDOW_DAYS: Record<WindowKey, number> = {
  "7d": 7,
  "14d": 14,
  "30d": 30,
  "90d": 90,
  "1yr": 365,
};

export const WINDOW_KEYS: WindowKey[] = ["7d", "14d", "30d", "90d", "1yr"];

const DEFAULT_WINDOW: WindowKey = "14d";

/** Read the active window from the mb-window cookie. Server-side only. */
export async function getWindow(): Promise<{ key: WindowKey; days: number }> {
  const store = await cookies();
  const raw = store.get("mb-window")?.value ?? "";
  const key: WindowKey = (
    WINDOW_KEYS.includes(raw as WindowKey) ? raw : DEFAULT_WINDOW
  ) as WindowKey;
  return { key, days: WINDOW_DAYS[key] };
}
