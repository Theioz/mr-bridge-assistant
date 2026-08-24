#!/usr/bin/env python3
"""Tests for occurrence generation in scripts/_recurrence.py.

Run: python3 -m unittest discover -s tests -v

WHY THIS EXISTS

A recurrence bug is silent. A series that emits the wrong dates still emits *plausible* dates —
chores appear, they can be ticked off, nothing errors. The way you find out is that the aquarium
gets dosed on Saturdays, or a monthly chore walks forward three days every February until it means
nothing. Both of those come from arithmetic that looks obviously right when you read it.

The rules pinned here are the ones with a wrong-but-reasonable alternative:
  - dates derive from starts_on, never from the previous occurrence (no drift on late completion)
  - month arithmetic clamps to month end (Jan 31 + 1 month is Feb 28, not Mar 3)
  - a weekly series does not emit days earlier in its own first week than starts_on
  - ends_on is inclusive and hard-stops generation
"""

import sys
import unittest
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))

# _recurrence imports nothing outside the stdlib, so this runs on a bare interpreter.
from _recurrence import describe_cadence, dow, occurrences_between  # noqa: E402


def occ(**kw):
    """occurrences_between with the window defaulted to the series' own lifetime."""
    kw.setdefault("byweekday", None)
    kw.setdefault("ends_on", None)
    kw.setdefault("window_start", kw["starts_on"])
    kw.setdefault("window_end", date(2027, 1, 1))
    return occurrences_between(**kw)


class TestDayOfWeek(unittest.TestCase):
    def test_sunday_is_zero(self):
        # 2026-08-23 is a Sunday. The 0=Sun convention has to match Postgres/JS, not Python's Mon=0.
        self.assertEqual(dow(date(2026, 8, 23)), 0)
        self.assertEqual(dow(date(2026, 8, 24)), 1)
        self.assertEqual(dow(date(2026, 8, 29)), 6)


class TestDaily(unittest.TestCase):
    def test_every_three_days_from_start(self):
        got = occ(freq="daily", interval=3, starts_on=date(2026, 8, 24), window_end=date(2026, 9, 2))
        self.assertEqual(
            got,
            [date(2026, 8, 24), date(2026, 8, 27), date(2026, 8, 30), date(2026, 9, 2)],
        )

    def test_window_start_snaps_forward_to_cadence(self):
        # Asking for a window that begins off-cadence must not shift the series onto the new phase.
        got = occurrences_between(
            freq="daily",
            interval=3,
            byweekday=None,
            starts_on=date(2026, 8, 24),
            ends_on=None,
            window_start=date(2026, 8, 28),
            window_end=date(2026, 9, 3),
        )
        self.assertEqual(got, [date(2026, 8, 30), date(2026, 9, 2)])

    def test_interval_one_is_every_day(self):
        got = occ(freq="daily", interval=1, starts_on=date(2026, 8, 24), window_end=date(2026, 8, 27))
        self.assertEqual(len(got), 4)


class TestWeekly(unittest.TestCase):
    def test_every_sunday(self):
        # The aquarium case. 2026-08-23 is a Sunday.
        got = occ(
            freq="weekly",
            interval=1,
            byweekday=[0],
            starts_on=date(2026, 8, 23),
            window_end=date(2026, 9, 14),
        )
        self.assertEqual(
            got,
            [date(2026, 8, 23), date(2026, 8, 30), date(2026, 9, 6), date(2026, 9, 13)],
        )
        for d in got:
            self.assertEqual(dow(d), 0)

    def test_first_week_does_not_emit_before_starts_on(self):
        # Mon+Thu series starting on a Wednesday must skip that week's Monday — it predates the
        # series. Naive "expand the start week" arithmetic emits it.
        got = occ(
            freq="weekly",
            interval=1,
            byweekday=[1, 4],  # Mon, Thu
            starts_on=date(2026, 8, 26),  # Wednesday
            window_end=date(2026, 9, 4),
        )
        self.assertEqual(got, [date(2026, 8, 27), date(2026, 8, 31), date(2026, 9, 3)])

    def test_biweekly_keeps_phase(self):
        got = occ(
            freq="weekly",
            interval=2,
            byweekday=[0],
            starts_on=date(2026, 8, 23),
            window_end=date(2026, 10, 5),
        )
        self.assertEqual(
            got, [date(2026, 8, 23), date(2026, 9, 6), date(2026, 9, 20), date(2026, 10, 4)]
        )

    def test_biweekly_window_midstream_keeps_phase(self):
        # Resuming mid-series must land on the series' weeks, not on the window's.
        got = occurrences_between(
            freq="weekly",
            interval=2,
            byweekday=[0],
            starts_on=date(2026, 8, 23),
            ends_on=None,
            window_start=date(2026, 9, 10),
            window_end=date(2026, 10, 5),
        )
        self.assertEqual(got, [date(2026, 9, 20), date(2026, 10, 4)])

    def test_empty_byweekday_defaults_to_start_weekday(self):
        got = occ(
            freq="weekly",
            interval=1,
            byweekday=[],
            starts_on=date(2026, 8, 25),  # Tuesday
            window_end=date(2026, 9, 9),
        )
        self.assertEqual(got, [date(2026, 8, 25), date(2026, 9, 1), date(2026, 9, 8)])


class TestMonthly(unittest.TestCase):
    def test_month_end_clamps_not_rolls(self):
        # Jan 31 + 1 month is Feb 28, and the series must return to 31 afterwards rather than
        # staying pinned at 28 — clamping is presentational, the anchor stays the 31st.
        got = occ(
            freq="monthly",
            interval=1,
            starts_on=date(2026, 1, 31),
            window_end=date(2026, 5, 1),
        )
        self.assertEqual(
            got,
            [date(2026, 1, 31), date(2026, 2, 28), date(2026, 3, 31), date(2026, 4, 30)],
        )

    def test_leap_year_february(self):
        got = occ(
            freq="monthly",
            interval=1,
            starts_on=date(2028, 1, 31),
            window_end=date(2028, 3, 1),
        )
        self.assertEqual(got, [date(2028, 1, 31), date(2028, 2, 29)])

    def test_every_two_months_crosses_year(self):
        got = occ(
            freq="monthly",
            interval=2,
            starts_on=date(2026, 11, 15),
            window_end=date(2027, 3, 20),
        )
        self.assertEqual(
            got, [date(2026, 11, 15), date(2027, 1, 15), date(2027, 3, 15)]
        )


class TestEndsOn(unittest.TestCase):
    def test_ends_on_is_inclusive(self):
        got = occ(
            freq="daily",
            interval=1,
            starts_on=date(2026, 8, 24),
            ends_on=date(2026, 8, 26),
            window_end=date(2026, 12, 31),
        )
        self.assertEqual(got, [date(2026, 8, 24), date(2026, 8, 25), date(2026, 8, 26)])

    def test_past_ends_on_yields_nothing(self):
        got = occurrences_between(
            freq="weekly",
            interval=1,
            byweekday=[0],
            starts_on=date(2026, 1, 4),
            ends_on=date(2026, 6, 30),
            window_start=date(2026, 8, 24),
            window_end=date(2026, 9, 7),
        )
        self.assertEqual(got, [])

    def test_window_entirely_before_start_yields_nothing(self):
        got = occurrences_between(
            freq="daily",
            interval=1,
            byweekday=None,
            starts_on=date(2026, 9, 1),
            ends_on=None,
            window_start=date(2026, 8, 1),
            window_end=date(2026, 8, 15),
        )
        self.assertEqual(got, [])


class TestNoDriftOnLateCompletion(unittest.TestCase):
    def test_dates_are_absolute_not_relative(self):
        """The whole reason a series table exists rather than a repeat_days column.

        Generating the same series over two different windows must produce identical dates for the
        overlapping stretch. Nothing about when an occurrence was completed can enter into it,
        because completion is not an input here at all.
        """
        early = occurrences_between(
            freq="weekly", interval=1, byweekday=[0],
            starts_on=date(2026, 8, 23), ends_on=None,
            window_start=date(2026, 8, 23), window_end=date(2026, 10, 31),
        )
        late = occurrences_between(
            freq="weekly", interval=1, byweekday=[0],
            starts_on=date(2026, 8, 23), ends_on=None,
            window_start=date(2026, 9, 15), window_end=date(2026, 10, 31),
        )
        self.assertEqual([d for d in early if d >= date(2026, 9, 15)], late)


class TestValidation(unittest.TestCase):
    def test_bad_freq_raises(self):
        with self.assertRaises(ValueError):
            occ(freq="yearly", interval=1, starts_on=date(2026, 8, 24))

    def test_zero_interval_raises(self):
        with self.assertRaises(ValueError):
            occ(freq="daily", interval=0, starts_on=date(2026, 8, 24))


class TestDescribeCadence(unittest.TestCase):
    def test_phrases(self):
        self.assertEqual(describe_cadence(freq="daily", interval=1, byweekday=None), "every day")
        self.assertEqual(describe_cadence(freq="daily", interval=3, byweekday=None), "every 3 days")
        self.assertEqual(
            describe_cadence(freq="weekly", interval=1, byweekday=[0]), "every Sunday"
        )
        self.assertEqual(
            describe_cadence(freq="weekly", interval=1, byweekday=[1, 4]), "every Mon, Thu"
        )
        self.assertEqual(
            describe_cadence(freq="monthly", interval=2, byweekday=None), "every 2 months"
        )

    def test_ends_on_suffix(self):
        self.assertEqual(
            describe_cadence(
                freq="weekly", interval=1, byweekday=[0], ends_on=date(2026, 12, 31)
            ),
            "every Sunday until 2026-12-31",
        )


if __name__ == "__main__":
    unittest.main()
