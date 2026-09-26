#!/usr/bin/env python3
"""Tests for scripts/_dates.py.

Run: python3 -m unittest discover -s tests -v

WHY THIS EXISTS

compute-core runs in UTC. `date.today()` there rolls over at 17:00 PDT, and every script that
used it spent each evening a day ahead: the briefing called tomorrow "today", printed the
morning's readiness as "last night", and hid the current day's meal plan (2026-09-25).
"""

import os
import sys
import unittest
from datetime import date, datetime, timezone
from unittest import mock

sys.path.insert(0, os.path.join(os.path.dirname(__file__), os.pardir, "scripts"))
import _dates  # noqa: E402

# 2026-09-26 03:40 UTC == 2026-09-25 20:40 PDT — the instant the bug was caught.
EVENING_UTC = datetime(2026, 9, 26, 3, 40, tzinfo=timezone.utc)


class _FrozenDatetime(datetime):
    @classmethod
    def now(cls, tz=None):
        return EVENING_UTC.astimezone(tz) if tz else EVENING_UTC.replace(tzinfo=None)


class TodayLocal(unittest.TestCase):
    def _today(self, tz):
        env = {"USER_TIMEZONE": tz} if tz is not None else {}
        with mock.patch.dict(os.environ, env, clear=False), \
                mock.patch.object(_dates, "datetime", _FrozenDatetime):
            if tz is None:
                os.environ.pop("USER_TIMEZONE", None)
            return _dates.today_local()

    def test_pacific_evening_is_still_the_same_day(self):
        self.assertEqual(self._today("America/Los_Angeles"), date(2026, 9, 25))

    def test_unset_defaults_to_pacific_not_host_utc(self):
        self.assertEqual(self._today(None), date(2026, 9, 25))

    def test_empty_string_defaults_to_pacific(self):
        self.assertEqual(self._today(""), date(2026, 9, 25))

    def test_honours_other_zones(self):
        self.assertEqual(self._today("UTC"), date(2026, 9, 26))


if __name__ == "__main__":
    unittest.main()
