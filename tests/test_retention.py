#!/usr/bin/env python3
"""Tests for the completed-task retention window (#684).

Run: python3 -m unittest discover -s tests -v

WHY THIS EXISTS

The purge and the two occurrence spawners share one number. The purge deletes completed
occurrences older than it; the spawners refuse to materialize dates older than it. If the Python
and TypeScript copies drift apart, the web spawner can look further back than the purge has
deleted, and an extended series re-creates purged chores as overdue tasks. Nothing errors. So the
two copies are pinned to each other here.
"""

import re
import sys
import unittest
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))

from _retention import RETENTION_DAYS, retention_floor  # noqa: E402


class RetentionTest(unittest.TestCase):
    def test_floor_is_retention_days_back(self):
        self.assertEqual(retention_floor(date(2026, 10, 5)), date(2026, 7, 7))

    def test_python_and_typescript_windows_match(self):
        ts = (ROOT / "web" / "src" / "lib" / "tasks" / "retention.ts").read_text()
        m = re.search(r"COMPLETED_RETENTION_DAYS\s*=\s*(\d+)", ts)
        self.assertIsNotNone(m, "COMPLETED_RETENTION_DAYS not found in retention.ts")
        self.assertEqual(int(m.group(1)), RETENTION_DAYS)


if __name__ == "__main__":
    unittest.main()
