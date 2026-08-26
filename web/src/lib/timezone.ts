export const USER_TZ: string = process.env.USER_TIMEZONE ?? "America/Los_Angeles";

/** Returns today's date as YYYY-MM-DD in the user's timezone. */
export function todayString(tz = USER_TZ): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date());
}

/**
 * Formats a `Date` as YYYY-MM-DD using its LOCAL calendar fields, not UTC.
 *
 * This is the counterpart to `todayString()`, and the two are not interchangeable:
 *
 * - `todayString()` answers "what day is it for the user right now" and is the right
 *   default for anything the user DID (a cook, a meal log). It ignores the `Date` you
 *   hand it because there isn't one — it reads the clock.
 * - `localDateString(d)` answers "which calendar square does this `Date` sit in". Use it
 *   wherever a `Date` was built from local fields — `new Date(y, m, d)`, `setDate()`,
 *   `getDay()` — and needs a key back out. `toISOString().slice(0, 10)` re-reads those
 *   local fields as UTC, which shifts the date by one for part of every day: west of
 *   Greenwich any evening instant reads as tomorrow, east of it a local midnight reads
 *   as yesterday.
 *
 * Deliberately NOT timezone-parameterised. Its whole job is to round-trip a `Date` that
 * was constructed in the runtime's own timezone; formatting it in some other zone would
 * reintroduce the mismatch this exists to remove.
 */
export function localDateString(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Returns the last N days as YYYY-MM-DD strings in the user's timezone,
 * oldest first (index 0 = N-1 days ago, last index = today).
 */
export function getLastNDays(n: number, tz = USER_TZ): string[] {
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(Date.now() - (n - 1 - i) * 86_400_000);
    return new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(d);
  });
}

/** Returns the last 7 days as YYYY-MM-DD strings in the user's timezone. */
export function getLast7Days(tz = USER_TZ): string[] {
  return getLastNDays(7, tz);
}

/** Returns a YYYY-MM-DD string for N days ago in the user's timezone. */
export function daysAgoString(days: number, tz = USER_TZ): string {
  const d = new Date(Date.now() - days * 86_400_000);
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(d);
}

/** Returns a YYYY-MM-DD string for N days from now in the user's timezone. */
export function daysAheadString(days: number, tz = USER_TZ): string {
  const d = new Date(Date.now() + days * 86_400_000);
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(d);
}

/**
 * Returns the next N days as YYYY-MM-DD strings in the user's timezone,
 * today first (index 0 = today, last index = N-1 days ahead).
 */
export function getNextNDays(n: number, tz = USER_TZ): string[] {
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(Date.now() + i * 86_400_000);
    return new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(d);
  });
}

/**
 * Returns the UTC offset string for a timezone at the current moment,
 * e.g. "-07:00" for PDT or "-08:00" for PST.
 */
function tzOffsetString(tz: string): string {
  const now = new Date();
  const utc = new Date(now.toLocaleString("en-US", { timeZone: "UTC" }));
  const local = new Date(now.toLocaleString("en-US", { timeZone: tz }));
  const diffMins = Math.round((local.getTime() - utc.getTime()) / 60_000);
  const sign = diffMins >= 0 ? "+" : "-";
  const abs = Math.abs(diffMins);
  const h = String(Math.floor(abs / 60)).padStart(2, "0");
  const m = String(abs % 60).padStart(2, "0");
  return `${sign}${h}:${m}`;
}

/**
 * Returns an RFC 3339 string for midnight of today in the user's timezone,
 * suitable for Google Calendar's timeMin.
 * e.g. "2026-04-10T00:00:00-07:00"
 */
export function startOfTodayRFC3339(tz = USER_TZ): string {
  return `${todayString(tz)}T00:00:00${tzOffsetString(tz)}`;
}

/**
 * Returns an RFC 3339 string for end-of-day today in the user's timezone,
 * suitable for Google Calendar's timeMax.
 * e.g. "2026-04-10T23:59:59-07:00"
 */
export function endOfTodayRFC3339(tz = USER_TZ): string {
  return `${todayString(tz)}T23:59:59${tzOffsetString(tz)}`;
}

/**
 * Returns an RFC 3339 string for midnight of an arbitrary date in the user's timezone.
 * date must be a YYYY-MM-DD string.
 * e.g. startOfDayRFC3339("2026-04-14") → "2026-04-14T00:00:00-07:00"
 */
export function startOfDayRFC3339(date: string, tz = USER_TZ): string {
  return `${date}T00:00:00${tzOffsetString(tz)}`;
}

/**
 * Returns an RFC 3339 string for end-of-day of an arbitrary date in the user's timezone.
 * date must be a YYYY-MM-DD string.
 */
export function endOfDayRFC3339(date: string, tz = USER_TZ): string {
  return `${date}T23:59:59${tzOffsetString(tz)}`;
}

/**
 * Adds N days to a YYYY-MM-DD string, returns a new YYYY-MM-DD string.
 * Uses UTC arithmetic to avoid DST shifts changing the date.
 */
export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Returns the Monday that STARTS the coming week, as YYYY-MM-DD.
 *
 * `from` must itself be a YYYY-MM-DD string already in the user's timezone —
 * pass `todayString()`, never a `Date`. Taking a string is the point: the caller
 * cannot accidentally hand this a UTC instant, which is exactly how the weekly
 * planner used to skip a week (see below).
 *
 * If `from` is itself a Monday the result is the NEXT Monday, never `from`. This
 * drives "plan the coming week", which is always the week that has not started yet.
 *
 * WHY THIS IS NOT INLINE ARITHMETIC ON A Date. The planner previously did
 * `new Date()` + `getDay()` on a server running UTC. Sunday evening Pacific is
 * already Monday in UTC, so `getDay()` returned Mon, the "coming Monday" became
 * Mon + 7, and planning on a Sunday night silently skipped the week that was
 * about to start.
 */
export function comingMonday(from: string): string {
  // Anchor at noon UTC so the weekday never shifts under a DST boundary.
  const dow = (new Date(`${from}T12:00:00Z`).getUTCDay() + 6) % 7; // 0=Mon … 6=Sun
  return addDays(from, (7 - dow) % 7 || 7);
}
