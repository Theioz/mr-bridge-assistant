import { google } from "googleapis";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getGoogleAuthClient } from "@/lib/google-auth";
import { getExcludedCalendarIds } from "@/lib/calendar/excluded";
import { endOfTodayRFC3339, startOfTodayRFC3339, todayString, USER_TZ } from "@/lib/timezone";
import { findCurrentStay, type CalendarEventLike, type Stay } from "./stay";

/** Past this, the dashboard renders without travel mode rather than waiting on Google. */
const DEFAULT_TIMEOUT_MS = 2500;

async function readStay(db: SupabaseClient, userId: string): Promise<Stay | null> {
  const auth = await getGoogleAuthClient({ db, userId });
  const calendar = google.calendar({ version: "v3", auth });
  const [calList, excluded] = await Promise.all([
    calendar.calendarList.list({ minAccessRole: "reader" }),
    getExcludedCalendarIds(db, userId),
  ]);
  const calendars = (calList.data.items ?? []).filter((c) => c.id && !excluded.has(c.id));
  // Google returns every event OVERLAPPING [timeMin, timeMax], so a multi-day stay that began
  // last week is included without widening the window.
  const timeMin = startOfTodayRFC3339();
  const timeMax = endOfTodayRFC3339();
  const lists = await Promise.all(
    calendars.map((cal) =>
      calendar.events
        .list({ calendarId: cal.id!, timeMin, timeMax, singleEvents: true, maxResults: 50 })
        .then((r) => (r.data.items ?? []) as CalendarEventLike[])
        .catch(() => [] as CalendarEventLike[]),
    ),
  );
  return findCurrentStay(lists.flat(), todayString(), USER_TZ);
}

/**
 * Where the owner is staying tonight, from a "Stay at …" calendar event — or null.
 *
 * Null on EVERY failure (Google not connected, token revoked, timeout): travel mode is an
 * enhancement, and a missing one simply means the dashboard behaves as it does at home.
 * Read-only — this never writes profile keys (see travel/stay.ts).
 */
export async function getCurrentStay(
  db: SupabaseClient,
  userId: string,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<Stay | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), timeoutMs);
  });
  try {
    return await Promise.race([readStay(db, userId).catch(() => null), timeout]);
  } finally {
    clearTimeout(timer);
  }
}
