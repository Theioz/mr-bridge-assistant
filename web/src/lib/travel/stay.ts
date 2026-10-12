// Travel mode: is there a "Stay at …" event on the calendar covering today?
//
// WHY A CALENDAR EVENT AND NOT A PROFILE SETTING
//
// The weather location already has a manual override (profile.location_city, see
// .claude/rules/location.md), and nobody remembers to set it before a trip or clear it after.
// Hotel bookings, though, land on the calendar on their own — Gmail turns a reservation into an
// all-day "Stay at The Westin Melbourne" event with the hotel's address in `location`. That event
// is already the truth about where he is, so travel mode reads it and never writes anything:
// no profile key is set on the way out, so there is nothing to forget to unset on the way back.
//
// Pure (no I/O): the caller supplies the events and today's date. The Python morning summary
// mirrors this in scripts/_travel.py; tests on both sides pin the same cases.

export const STAY_PREFIX = /^\s*stay at\s+/i;

/** The subset of a Google Calendar event this needs. Matches calendar_v3.Schema$Event. */
export interface CalendarEventLike {
  summary?: string | null;
  location?: string | null;
  status?: string | null;
  start?: { date?: string | null; dateTime?: string | null } | null;
  end?: { date?: string | null; dateTime?: string | null } | null;
}

export interface Stay {
  /** The place, with "Stay at" removed: "The Westin Melbourne". */
  name: string;
  /** The event's location string, verbatim (usually a street address). Null if the event has none. */
  location: string | null;
  /** First day covered, YYYY-MM-DD. */
  start: string;
  /** LAST day covered, YYYY-MM-DD, inclusive — for an all-day event, Google's exclusive end minus one. */
  end: string;
}

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** The calendar date of an RFC3339 instant in `tz`. */
function localDate(dateTime: string, tz: string): string | null {
  const t = new Date(dateTime);
  if (Number.isNaN(t.getTime())) return null;
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(t);
}

/** Span of an event as inclusive [start, end] local dates, or null if it can't be read. */
function span(e: CalendarEventLike, tz: string): { start: string; end: string } | null {
  if (e.start?.date) {
    // All-day: Google's end.date is EXCLUSIVE (a one-night event on the 12th ends on the 13th).
    const start = e.start.date;
    const endExclusive = e.end?.date ?? addDays(start, 1);
    const end = addDays(endExclusive, -1);
    return end < start ? { start, end: start } : { start, end };
  }
  if (e.start?.dateTime) {
    const start = localDate(e.start.dateTime, tz);
    const end = e.end?.dateTime ? localDate(e.end.dateTime, tz) : start;
    if (!start || !end) return null;
    return end < start ? { start, end: start } : { start, end };
  }
  return null;
}

/**
 * The stay covering `today`, or null.
 *
 * - The title must START with "Stay at" (case-insensitive). "Dinner at the Stay at Home Café"
 *   does not count, and neither does a meeting that merely has a hotel in `location`.
 * - All-day and timed events both count; all-day is what Gmail creates.
 * - Cancelled events are ignored.
 * - On a changeover day (check out of one hotel, into the next) both cover today; the one that
 *   started LATER wins, because that is where tonight is.
 */
export function findCurrentStay(
  events: ReadonlyArray<CalendarEventLike>,
  today: string,
  tz: string = "UTC",
): Stay | null {
  let best: Stay | null = null;
  for (const e of events) {
    if (e.status === "cancelled") continue;
    const title = e.summary ?? "";
    if (!STAY_PREFIX.test(title)) continue;
    const s = span(e, tz);
    if (!s || s.start > today || s.end < today) continue;
    const name = title.replace(STAY_PREFIX, "").trim() || title.trim();
    const location = e.location?.trim() || null;
    if (!best || s.start > best.start) best = { name, location, start: s.start, end: s.end };
  }
  return best;
}

/**
 * Place names worth sending to a city geocoder, best first, from a free-text location.
 *
 * The geocoder the weather code uses (Open-Meteo) searches PLACE NAMES, not addresses — the full
 * "The Westin Melbourne, 205 Collins St, Melbourne VIC 3000, Australia" matches nothing, and the
 * existing "text before the first comma" fallback gives "The Westin Melbourne", which matches
 * nothing either. The city is almost always the segment just before the country, so segments are
 * tried from the end backwards with postcodes and state codes stripped:
 *
 *   "…, 205 Collins St, Melbourne VIC 3000, Australia" → ["Melbourne", "The Westin Melbourne"]
 *   "Hilton, 500 E 4th St, Austin, TX 78701, USA"      → ["Austin", "Hilton"]
 *   "Kyoto"                                            → ["Kyoto"]
 *
 * Street lines (a segment starting with a number) are skipped: "Collins St" would geocode to the
 * wrong place, which is worse than not geocoding at all.
 */
export function geocodeCandidates(location: string | null | undefined): string[] {
  const raw = (location ?? "").trim();
  if (!raw) return [];
  const segments = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const clean = (seg: string): string => {
    const words = seg.split(/\s+/).filter((w) => !/\d/.test(w));
    // Drop trailing state/province codes ("VIC", "TX", "NSW") but never the last word standing.
    while (words.length > 1 && /^[A-Z]{2,3}$/.test(words[words.length - 1])) words.pop();
    return words.join(" ").trim();
  };
  const usable = (seg: string, cleaned: string): boolean =>
    !/^\d/.test(seg) && cleaned.length > 0 && !/^[A-Z]{2,3}$/.test(cleaned);

  const out: string[] = [];
  const push = (seg: string) => {
    const c = clean(seg);
    if (usable(seg, c) && !out.includes(c)) out.push(c);
  };

  if (segments.length === 1) {
    push(segments[0]);
    return out;
  }
  // Last segment is the country — searching for "Australia" gives a point in the outback.
  for (let i = segments.length - 2; i >= 0; i--) push(segments[i]);
  return out;
}

/** A short display name for where the stay is: the best geocoder candidate, else the hotel. */
export function stayCity(stay: Pick<Stay, "name" | "location">): string {
  return geocodeCandidates(stay.location)[0] ?? stay.name;
}
