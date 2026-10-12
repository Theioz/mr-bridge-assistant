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
 * The geocoder the weather code uses (Open-Meteo) searches PLACE NAMES, not addresses, so the city
 * has to be pulled out of the address. Segments are tried from the end backwards (the country, the
 * last segment, is set aside: see addressCountry):
 *
 *   "…, 205 Collins St, Melbourne VIC 3000, Australia"      → ["Melbourne", "The Westin Melbourne"]
 *   "205 Collins Street Melbourne, Victoria 3000 Australia" → ["Melbourne", "Victoria"]
 *   "Hilton, 500 E 4th St, Austin, TX 78701, USA"           → ["Austin", "Hilton"]
 *
 * A segment that starts with a street number contributes only its LAST word, and only when that word
 * is not a street suffix: "205 Collins Street Melbourne" → "Melbourne", "205 Collins St" → nothing.
 * The second form is the one Google Calendar actually writes for hotel bookings. The first version of
 * this function skipped number-led segments entirely, found no candidates for it, and travel mode
 * quietly showed home weather (#761). Region words left in the last segment ("Victoria" before the
 * country) come last, as a coarse fallback.
 */
const STREET_SUFFIX =
  /^(st|street|rd|road|ave|avenue|blvd|boulevard|ln|lane|dr|drive|way|pl|place|ct|court|hwy|highway|pde|parade|tce|terrace|cres|crescent|sq|square)\.?$/i;
const MULTIWORD_COUNTRIES = [
  "united states",
  "united kingdom",
  "new zealand",
  "south korea",
  "south africa",
  "hong kong",
  "united arab emirates",
];

/** The country named at the end of an address, or null. "…, Victoria 3000 Australia" → "Australia". */
export function addressCountry(location: string | null | undefined): string | null {
  const segments = (location ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (segments.length < 2) return null;
  const words = segments[segments.length - 1].split(/\s+/).filter((w) => !/\d/.test(w));
  if (!words.length) return null;
  const tail = words.join(" ").toLowerCase();
  const multi = MULTIWORD_COUNTRIES.find((c) => tail.endsWith(c));
  if (multi) return words.slice(-multi.split(" ").length).join(" ");
  return words[words.length - 1];
}

export function geocodeCandidates(location: string | null | undefined): string[] {
  const raw = (location ?? "").trim();
  if (!raw) return [];
  const segments = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const words = (seg: string): string[] => {
    const w = seg.split(/\s+/).filter((x) => x && !/\d/.test(x));
    // Drop trailing state/province codes ("VIC", "TX", "NSW") but never the last word standing.
    while (w.length > 1 && /^[A-Z]{2,3}$/.test(w[w.length - 1])) w.pop();
    return w;
  };
  const out: string[] = [];
  const push = (c: string) => {
    if (c && !/^[A-Z]{2,3}$/.test(c) && !out.includes(c)) out.push(c);
  };
  const fromSegment = (seg: string) => {
    const w = words(seg);
    if (!w.length) return;
    if (/^\d/.test(seg)) {
      // A street line. Only a trailing city-like word is usable ("…Street Melbourne").
      const last = w[w.length - 1];
      if (w.length > 1 && !STREET_SUFFIX.test(last)) push(last);
      return;
    }
    push(w.join(" "));
  };

  if (segments.length === 1) {
    fromSegment(segments[0]);
    return out;
  }
  for (let i = segments.length - 2; i >= 0; i--) fromSegment(segments[i]);

  // Whatever precedes the country in the last segment ("Victoria" in "Victoria 3000 Australia").
  const country = addressCountry(raw);
  const last = words(segments[segments.length - 1]);
  const region = country ? last.slice(0, last.length - country.split(" ").length) : [];
  if (region.length) push(region.join(" "));
  return out;
}

/** A short display name for where the stay is: the best geocoder candidate, else the hotel. */
export function stayCity(stay: Pick<Stay, "name" | "location">): string {
  return geocodeCandidates(stay.location)[0] ?? stay.name;
}
