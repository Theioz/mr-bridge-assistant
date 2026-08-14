#!/usr/bin/env python3
"""Tests for consecutive_misses in scripts/coach_check.py.

Run: python3 -m unittest discover -s tests -v

WHY THIS EXISTS

The miss count drives a real escalation: 2 misses cuts training volume, 3 concludes the program
is wrong rather than the user. Before #666 the app never set `workout_plans.status`, so this count
keyed off session-existence alone — and a deliberate rest (a `cancelled`/`skipped` day with no
session) read as a MISS, inflating the streak and firing a false "the program is too much" nudge.
That mis-read is the same open-loop defect that killed the May coaching attempt.

The rule — a miss is a `planned` day with no session; a chosen rest is never a miss — now lives in
code instead of in a memory file. These tests pin it. The failure mode is silent (a wrong integer
that reads as plausible), so it needs its own tests.
"""

import os
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))

# coach_check imports _supabase (and dotenv) lazily inside main(), so importing the module for the
# pure helper needs no dependencies — matching the bare-interpreter CI job. Guard the env anyway.
os.environ.setdefault("USER_TIMEZONE", "America/Los_Angeles")

from coach_check import consecutive_misses  # noqa: E402


def plans(*rows):
    """rows are (date, status), most-recent first — the order coach_check queries them in."""
    return [{"date": d, "status": s} for d, s in rows]


class TestConsecutiveMisses(unittest.TestCase):
    def test_no_plans_is_zero(self):
        self.assertEqual(consecutive_misses([], set()), 0)

    def test_a_logged_session_ends_the_streak(self):
        recent = plans(("2026-08-13", "planned"), ("2026-08-11", "completed"))
        # 8/13 has no session (miss), 8/11 was trained → stop.
        self.assertEqual(consecutive_misses(recent, {"2026-08-11"}), 1)

    def test_most_recent_logged_day_is_zero_misses(self):
        recent = plans(("2026-08-13", "completed"))
        self.assertEqual(consecutive_misses(recent, {"2026-08-13"}), 1 - 1)  # == 0

    def test_three_planned_no_session_is_three(self):
        recent = plans(
            ("2026-08-13", "planned"),
            ("2026-08-11", "planned"),
            ("2026-08-09", "planned"),
        )
        self.assertEqual(consecutive_misses(recent, set()), 3)

    def test_cancelled_day_is_not_a_miss_and_does_not_reset(self):
        # A deliberate rest between two genuine misses: the rest is transparent, the two
        # planned-no-session days still count. This is the whole point of reading status.
        recent = plans(
            ("2026-08-13", "planned"),
            ("2026-08-12", "cancelled"),
            ("2026-08-11", "planned"),
        )
        self.assertEqual(consecutive_misses(recent, set()), 2)

    def test_skipped_day_is_not_a_miss(self):
        recent = plans(("2026-08-13", "skipped"), ("2026-08-11", "skipped"))
        self.assertEqual(consecutive_misses(recent, set()), 0)

    def test_all_cancelled_deload_week_fires_no_miss(self):
        recent = plans(
            ("2026-08-13", "cancelled"),
            ("2026-08-11", "cancelled"),
            ("2026-08-09", "cancelled"),
        )
        # Must not escalate to "the program is too much" on a chosen deload.
        self.assertEqual(consecutive_misses(recent, set()), 0)

    def test_completed_without_a_session_row_is_not_a_miss(self):
        # Defensive: a completed status but no session row (a data anomaly) is not un-actioned,
        # so it is skipped rather than counted.
        recent = plans(("2026-08-13", "completed"), ("2026-08-11", "planned"))
        self.assertEqual(consecutive_misses(recent, set()), 1)


if __name__ == "__main__":
    unittest.main()
