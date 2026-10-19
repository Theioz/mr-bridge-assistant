"""
Travel mode: is there a "Stay at ..." calendar event covering today?

Python mirror of web/src/lib/travel/stay.ts, so the morning summary and the dashboard agree on
whether you're away. Hotel bookings land on the calendar on their own (Gmail turns a reservation
into an all-day "Stay at The Westin Melbourne" event with the address in `location`), so the
calendar is read and NOTHING is written: no profile key is set on the way out, so there is nothing
to forget to unset on the way back.

Pure and stdlib-only (no I/O) so tests/test_travel.py can pin it without Supabase or network.
"""
from __future__ import annotations

import re
from datetime import date, datetime, timedelta, tzinfo

STAY_PREFIX = re.compile(r"^\s*stay at\s+", re.IGNORECASE)


def _local_date(date_time: str, tz: tzinfo) -> date | None:
    try:
        # fromisoformat handles offsets; "Z" needs translating before Python 3.11.
        return datetime.fromisoformat(date_time.replace("Z", "+00:00")).astimezone(tz).date()
    except (TypeError, ValueError):
        return None


def _span(event: dict, tz: tzinfo) -> tuple[date, date] | None:
    """Inclusive (first, last) local days an event covers."""
    start = event.get("start") or {}
    end = event.get("end") or {}
    if start.get("date"):
        try:
            first = date.fromisoformat(start["date"])
            # All-day end.date is EXCLUSIVE: a one-night event on the 12th ends on the 13th.
            end_excl = date.fromisoformat(end["date"]) if end.get("date") else first + timedelta(days=1)
        except ValueError:
            return None
        last = end_excl - timedelta(days=1)
        return first, max(first, last)
    if start.get("dateTime"):
        first = _local_date(start["dateTime"], tz)
        last = _local_date(end["dateTime"], tz) if end.get("dateTime") else first
        if first is None or last is None:
            return None
        return first, max(first, last)
    return None


def find_current_stay(events: list[dict], today: date, tz: tzinfo) -> dict | None:
    """The "Stay at ..." event covering `today`, as {name, location, start, end} (ISO dates, end
    inclusive), or None. Same rules as findCurrentStay in stay.ts: the title must START with
    "Stay at", cancelled events are ignored, and on a changeover day the later-starting stay wins
    because that is where tonight is."""
    best: dict | None = None
    for e in events:
        if e.get("status") == "cancelled":
            continue
        title = e.get("summary") or ""
        if not STAY_PREFIX.match(title):
            continue
        span = _span(e, tz)
        if span is None or span[0] > today or span[1] < today:
            continue
        name = STAY_PREFIX.sub("", title).strip() or title.strip()
        location = (e.get("location") or "").strip() or None
        if best is None or span[0].isoformat() > best["start"]:
            best = {"name": name, "location": location,
                    "start": span[0].isoformat(), "end": span[1].isoformat()}
    return best


TRIP_WATER_DAYS = 3


def stay_days(events: list[dict], start: date, end: date, tz: tzinfo) -> set[date]:
    """Every local day in [start, end] covered by a "Stay at ..." event. Same title and
    cancellation rules as find_current_stay; used by the coaching loop, which needs a range."""
    out: set[date] = set()
    for e in events:
        if e.get("status") == "cancelled" or not STAY_PREFIX.match(e.get("summary") or ""):
            continue
        span = _span(e, tz)
        if span is None:
            continue
        d = max(span[0], start)
        while d <= min(span[1], end):
            out.add(d)
            d += timedelta(days=1)
    return out


def excluded_weigh_ins(days_away: set[date], after: int = TRIP_WATER_DAYS) -> set[date]:
    """Days whose scale reading says more about the trip than about fat: every day away plus
    `after` days past each return. Flights, restaurant sodium and the carb refeed put 2-4 lb of
    water on the scale that clears in about three days of normal eating; counting it reads a
    vacation as a failed week."""
    out = set(days_away)
    for d in days_away:
        if d + timedelta(days=1) not in days_away:  # last day of a stay
            out.update(d + timedelta(days=i) for i in range(1, after + 1))
    return out


STREET_SUFFIX = re.compile(
    r"^(st|street|rd|road|ave|avenue|blvd|boulevard|ln|lane|dr|drive|way|pl|place|ct|court|hwy|"
    r"highway|pde|parade|tce|terrace|cres|crescent|sq|square)\.?$",
    re.I,
)
MULTIWORD_COUNTRIES = ["united states", "united kingdom", "new zealand", "south korea",
                       "south africa", "hong kong", "united arab emirates"]


def address_country(location: str | None) -> str | None:
    """The country named at the end of an address. "…, Victoria 3000 Australia" -> "Australia"."""
    segments = [s.strip() for s in (location or "").split(",") if s.strip()]
    if len(segments) < 2:
        return None
    words = [w for w in segments[-1].split() if not re.search(r"\d", w)]
    if not words:
        return None
    tail = " ".join(words).lower()
    for c in MULTIWORD_COUNTRIES:
        if tail.endswith(c):
            return " ".join(words[-len(c.split()):])
    return words[-1]


def geocode_candidates(location: str | None) -> list[str]:
    """Place names worth sending to Open-Meteo's place-name geocoder, best first.

    Mirror of web/src/lib/travel/stay.ts geocodeCandidates — keep the two in step.
      "…, 205 Collins St, Melbourne VIC 3000, Australia"      -> ["Melbourne", "The Westin Melbourne"]
      "205 Collins Street Melbourne, Victoria 3000 Australia" -> ["Melbourne", "Victoria"]
    A street line contributes only a trailing non-suffix word; the second form is what Google
    Calendar writes, and the first version produced nothing for it (#761).
    """
    raw = (location or "").strip()
    if not raw:
        return []
    segments = [s.strip() for s in raw.split(",") if s.strip()]

    def words(seg: str) -> list[str]:
        w = [x for x in seg.split() if not re.search(r"\d", x)]
        while len(w) > 1 and re.fullmatch(r"[A-Z]{2,3}", w[-1]):
            w.pop()
        return w

    out: list[str] = []

    def push(c: str) -> None:
        if c and not re.fullmatch(r"[A-Z]{2,3}", c) and c not in out:
            out.append(c)

    def from_segment(seg: str) -> None:
        w = words(seg)
        if not w:
            return
        if re.match(r"\d", seg):
            if len(w) > 1 and not STREET_SUFFIX.match(w[-1]):
                push(w[-1])
            return
        push(" ".join(w))

    if len(segments) == 1:
        from_segment(segments[0])
        return out
    for seg in reversed(segments[:-1]):
        from_segment(seg)
    country = address_country(raw)
    last = words(segments[-1])
    region = last[: len(last) - len(country.split())] if country else []
    if region:
        push(" ".join(region))
    return out


def stay_city(stay: dict) -> str:
    """Short display name for where the stay is: best geocoder candidate, else the hotel."""
    cands = geocode_candidates(stay.get("location"))
    return cands[0] if cands else stay.get("name", "")
