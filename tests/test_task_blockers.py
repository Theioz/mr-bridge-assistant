#!/usr/bin/env python3
"""Tests for task dependencies in the briefing (scripts/_task_blockers.py, #470).

Run: python3 -m unittest discover -s tests -v

WHY THIS EXISTS

The acceptance criterion is that completing a blocker surfaces the newly-unblocked task in the next
briefing. Both ways it can go wrong are quiet: a window that starts at midnight TODAY drops a
blocker finished at 11 PM, so the task stays buried; a window with no start re-announces the same
unblocking every morning until nobody reads it.
"""

import sys
import unittest
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))

from _task_blockers import is_blocked, newly_unblocked  # noqa: E402

SINCE = datetime(2026, 10, 4, 7, 0, tzinfo=timezone.utc)  # start of yesterday, 00:00 PT


def task(blocker_status, completed_at=None, status="active", title="Book flight"):
    blocker = {"title": "Submit expense report", "status": blocker_status, "completed_at": completed_at}
    return {"title": title, "status": status, "blocker": blocker}


class BlockedTest(unittest.TestCase):
    def test_active_blocker_blocks(self):
        self.assertTrue(is_blocked(task("active")))

    def test_completed_or_archived_blocker_releases(self):
        self.assertFalse(is_blocked(task("completed")))
        self.assertFalse(is_blocked(task("archived")))

    def test_no_blocker(self):
        self.assertFalse(is_blocked({"title": "x", "status": "active", "blocker": None}))
        self.assertFalse(is_blocked({"title": "x", "status": "active"}))


class NewlyUnblockedTest(unittest.TestCase):
    def test_blocker_finished_late_yesterday_surfaces(self):
        t = task("completed", "2026-10-05T06:00:00+00:00")  # 23:00 PT on Oct 4
        self.assertEqual(newly_unblocked([t], SINCE), [t])

    def test_blocker_finished_before_the_window_does_not_repeat(self):
        self.assertEqual(newly_unblocked([task("completed", "2026-10-02T18:00:00+00:00")], SINCE), [])

    def test_archived_blocker_is_not_news(self):
        self.assertEqual(newly_unblocked([task("archived", "2026-10-05T06:00:00+00:00")], SINCE), [])

    def test_still_blocked_is_not_unblocked(self):
        self.assertEqual(newly_unblocked([task("active")], SINCE), [])

    def test_z_suffix_timestamps_parse(self):
        t = task("completed", "2026-10-05T06:00:00Z")
        self.assertEqual(newly_unblocked([t], SINCE), [t])


if __name__ == "__main__":
    unittest.main()
