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


def geocode_candidates(location: str | None) -> list[str]:
    """Place names worth sending to Open-Meteo's place-name geocoder, best first.

    It matches PLACE NAMES, not addresses, so the city — usually the segment just before the
    country — is tried first, with postcodes and state codes stripped; street lines are skipped:
      "..., 205 Collins St, Melbourne VIC 3000, Australia" -> ["Melbourne", "The Westin Melbourne"]
    """
    raw = (location or "").strip()
    if not raw:
        return []
    segments = [s.strip() for s in raw.split(",") if s.strip()]

    def clean(seg: str) -> str:
        words = [w for w in seg.split() if not re.search(r"\d", w)]
        while len(words) > 1 and re.fullmatch(r"[A-Z]{2,3}", words[-1]):
            words.pop()
        return " ".join(words).strip()

    out: list[str] = []

    def push(seg: str) -> None:
        c = clean(seg)
        if re.match(r"\d", seg) or not c or re.fullmatch(r"[A-Z]{2,3}", c) or c in out:
            return
        out.append(c)

    if len(segments) == 1:
        push(segments[0])
        return out
    # The last segment is the country; searching "Australia" lands in the outback.
    for seg in reversed(segments[:-1]):
        push(seg)
    return out


def stay_city(stay: dict) -> str:
    """Short display name for where the stay is: best geocoder candidate, else the hotel."""
    cands = geocode_candidates(stay.get("location"))
    return cands[0] if cands else stay.get("name", "")
