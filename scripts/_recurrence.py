"""
Occurrence-date generation for recurring task series (#468).

The whole recurrence model lives here so the spawner stays a thin I/O shell and the rules are
testable without a database. Three freqs, an interval, and an optional weekday set — deliberately
not RFC 5545. See supabase/migrations/20260824000000_task_series.sql for why.

Import as: from _recurrence import occurrences_between, describe_cadence
"""
from __future__ import annotations

from calendar import monthrange
from datetime import date, timedelta

FREQS = ("daily", "weekly", "monthly")

# 0=Sun … 6=Sat — matches Postgres extract(dow) and JS Date.getDay(). Python's date.weekday() is
# Mon=0, so every conversion goes through this helper rather than an inline +1 % 7 scattered around.
_WEEKDAY_NAMES = ("Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday")


def dow(d: date) -> int:
    """Day of week as 0=Sun … 6=Sat."""
    return (d.weekday() + 1) % 7


def _add_months(d: date, months: int) -> date:
    """Shift by whole months, clamping to the end of the target month.

    Jan 31 + 1 month is Feb 28 (or 29), not Mar 3. Rolling over into the next month would make a
    monthly series drift forward a few days every short month until it no longer means anything.
    """
    total = (d.year * 12 + (d.month - 1)) + months
    year, month = divmod(total, 12)
    month += 1
    return date(year, month, min(d.day, monthrange(year, month)[1]))


def occurrences_between(
    *,
    freq: str,
    interval: int,
    byweekday: list[int] | None,
    starts_on: date,
    ends_on: date | None,
    window_start: date,
    window_end: date,
) -> list[date]:
    """Occurrence dates for a series that fall within [window_start, window_end].

    Dates are always derived from `starts_on`, never from the previous occurrence or from the
    completion of one — that is what stops a late-completed chore from dragging the whole series
    with it. Returns sorted, de-duplicated dates.
    """
    if freq not in FREQS:
        raise ValueError(f"unknown freq: {freq!r}")
    if interval < 1:
        raise ValueError(f"interval must be >= 1, got {interval}")

    # Clamp the requested window to the series' own lifetime before generating anything.
    lo = max(window_start, starts_on)
    hi = window_end if ends_on is None else min(window_end, ends_on)
    if lo > hi:
        return []

    out: list[date] = []

    if freq == "daily":
        # Snap forward to the first on-cadence day at or after `lo`, then step by interval.
        delta = (lo - starts_on).days
        step_index = -(-delta // interval)  # ceil division
        cur = starts_on + timedelta(days=step_index * interval)
        while cur <= hi:
            out.append(cur)
            cur += timedelta(days=interval)

    elif freq == "weekly":
        # An empty/absent byweekday means "the weekday starts_on falls on" — a weekly series always
        # has at least one day, and defaulting keeps a half-filled form from producing nothing.
        days = sorted(set(byweekday)) if byweekday else [dow(starts_on)]
        # Weeks are counted from the Sunday of the start week so that `interval` means "every N
        # weeks" consistently, regardless of which weekday the series started on.
        week0 = starts_on - timedelta(days=dow(starts_on))
        cur_week = week0
        # Skip whole weeks cheaply rather than walking day by day from starts_on.
        if lo > cur_week:
            weeks_elapsed = (lo - cur_week).days // 7
            cur_week += timedelta(days=(weeks_elapsed - (weeks_elapsed % interval)) * 7)
        while cur_week <= hi:
            for wd in days:
                d = cur_week + timedelta(days=wd)
                # `>= starts_on` matters on the first week: a Mon/Thu series starting Wednesday must
                # not emit that week's Monday, which is before the series existed.
                if lo <= d <= hi and d >= starts_on:
                    out.append(d)
            cur_week += timedelta(days=7 * interval)

    else:  # monthly
        # Walk month steps from starts_on. Bounded by `hi`, so the loop is short.
        n = 0
        while True:
            d = _add_months(starts_on, n * interval)
            if d > hi:
                break
            if d >= lo:
                out.append(d)
            n += 1

    return sorted(set(out))


def describe_cadence(
    *, freq: str, interval: int, byweekday: list[int] | None, ends_on: date | None = None
) -> str:
    """Human phrasing for a series, e.g. 'every Sunday', 'every 3 days', 'monthly until 2026-12-31'.

    Kept in step with cadenceLabel() in web/src/lib/tasks/recurrence.ts — the notification body and
    the task row should not describe the same series differently.
    """
    if freq == "daily":
        base = "every day" if interval == 1 else f"every {interval} days"
    elif freq == "weekly":
        days = sorted(set(byweekday)) if byweekday else []
        if interval == 1 and len(days) == 1:
            base = f"every {_WEEKDAY_NAMES[days[0]]}"
        elif interval == 1 and days:
            base = "every " + ", ".join(_WEEKDAY_NAMES[d][:3] for d in days)
        elif interval == 1:
            base = "every week"
        else:
            base = f"every {interval} weeks"
            if days:
                base += " on " + ", ".join(_WEEKDAY_NAMES[d][:3] for d in days)
    else:
        base = "every month" if interval == 1 else f"every {interval} months"

    return f"{base} until {ends_on.isoformat()}" if ends_on else base
