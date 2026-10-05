#!/usr/bin/env python3
"""Tests for silent-series detection in scripts/_series_health.py (#703).

Run: python3 -m unittest discover -s tests -v

WHY THIS EXISTS

The spawner's "created 0 occurrence(s)" line reads the same whether everything is fine or a chore
has quietly vanished from the list, and on 2026-08-24 it was misread in the wrong direction. Both
mistakes this check can make are quiet: miss a skipped-out series and the chore disappears with a
clean log; flag a healthy monthly chore and the warning becomes noise everyone learns to ignore.
"""

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))

from _series_health import is_silent  # noqa: E402

WINDOW = ["2026-10-06", "2026-10-13"]  # a weekly chore's dates in the next 14 days


def row(status, d):
    return {"status": status, "occurrence_date": d}


class SilentSeriesTest(unittest.TestCase):
    def test_every_in_window_date_skipped_is_silent(self):
        rows = [row("archived", "2026-10-06"), row("archived", "2026-10-13")]
        self.assertTrue(is_silent(WINDOW, rows))

    def test_never_materialized_is_silent(self):
        self.assertTrue(is_silent(WINDOW, []))

    def test_an_active_occurrence_is_not_silent(self):
        self.assertFalse(is_silent(WINDOW, [row("archived", "2026-10-06"), row("active", "2026-10-13")]))

    def test_an_overdue_active_occurrence_still_shows_on_the_list(self):
        self.assertFalse(is_silent(WINDOW, [row("active", "2026-09-29"), row("archived", "2026-10-06")]))

    def test_completed_early_is_on_top_of_it(self):
        self.assertFalse(is_silent(WINDOW, [row("completed", "2026-10-06"), row("archived", "2026-10-13")]))

    def test_a_completed_date_outside_the_window_does_not_count(self):
        self.assertTrue(is_silent(WINDOW, [row("completed", "2026-09-29"), row("archived", "2026-10-06")]))

    def test_nothing_due_in_the_window_is_not_silent(self):
        # Monthly chore, next date beyond the window: not due, so nothing is missing.
        self.assertFalse(is_silent([], []))


if __name__ == "__main__":
    unittest.main()
