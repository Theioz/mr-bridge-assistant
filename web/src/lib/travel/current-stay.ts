import { google } from "googleapis";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getGoogleAuthClient } from "@/lib/google-auth";
import { getExcludedCalendarIds } from "@/lib/calendar/excluded";
import {
  endOfDayRFC3339,
  endOfTodayRFC3339,
  startOfDayRFC3339,
  startOfTodayRFC3339,
  todayString,
  USER_TZ,
} from "@/lib/timezone";
import { findCurrentStay, stayDays, type CalendarEventLike, type Stay } from "./stay";

/** Past this, the dashboard renders without travel mode rather than waiting on Google. */
const DEFAULT_TIMEOUT_MS = 2500;

/** Every event overlapping [timeMin, timeMax] across the user's non-excluded calendars. */
async function listEvents(
  db: SupabaseClient,
  userId: string,
  timeMin: string,
  timeMax: string,
): Promise<CalendarEventLike[]> {
  const auth = await getGoogleAuthClient({ db, userId });
  const calendar = google.calendar({ version: "v3", auth });
  const [calList, excluded] = await Promise.all([
    calendar.calendarList.list({ minAccessRole: "reader" }),
    getExcludedCalendarIds(db, userId),
  ]);
  const calendars = (calList.data.items ?? []).filter((c) => c.id && !excluded.has(c.id));
  // Google returns every event OVERLAPPING [timeMin, timeMax], so a multi-day stay that began
  // last week is included without widening the window.
  const lists = await Promise.all(
    calendars.map((cal) =>
      calendar.events
        .list({ calendarId: cal.id!, timeMin, timeMax, singleEvents: true, maxResults: 50 })
        .then((r) => (r.data.items ?? []) as CalendarEventLike[])
        .catch(() => [] as CalendarEventLike[]),
    ),
  );
  return lists.flat();
}

async function readStay(db: SupabaseClient, userId: string): Promise<Stay | null> {
  const events = await listEvents(db, userId, startOfTodayRFC3339(), endOfTodayRFC3339());
  return findCurrentStay(events, todayString(), USER_TZ);
}

/** Resolve to `fallback` on any failure or after `timeoutMs`, whichever comes first. */
async function failSoft<T>(work: Promise<T>, fallback: T, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<T>((resolve) => {
    timer = setTimeout(() => resolve(fallback), timeoutMs);
  });
  try {
    return await Promise.race([work.catch(() => fallback), timeout]);
  } finally {
    clearTimeout(timer);
  }
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
  return failSoft(readStay(db, userId), null, timeoutMs);
}

/**
 * The days in [start, end] (YYYY-MM-DD, inclusive) covered by a "Stay at …" event — or [] on
 * EVERY failure, like getCurrentStay. The weekly planner treats these as away (no lifting day);
 * an unreadable calendar must not block planning, it just plans as if at home.
 */
export async function getStayDays(
  db: SupabaseClient,
  userId: string,
  start: string,
  end: string,
  timeoutMs: number = 5000,
): Promise<string[]> {
  const work = listEvents(db, userId, startOfDayRFC3339(start), endOfDayRFC3339(end)).then(
    (events) => stayDays(events, start, end, USER_TZ),
  );
  return failSoft(work, [] as string[], timeoutMs);
}
