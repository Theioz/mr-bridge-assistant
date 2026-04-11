export const USER_TZ: string = process.env.USER_TIMEZONE ?? "America/Los_Angeles";

/** Returns today's date as YYYY-MM-DD in the user's timezone. */
export function todayString(tz = USER_TZ): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date());
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
