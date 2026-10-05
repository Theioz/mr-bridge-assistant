#!/usr/bin/env python3
"""Tests for scripts/web_vitals_report.py (#445). The percentile is the number the decision rests on."""

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))

from web_vitals_report import percentile  # noqa: E402


class PercentileTest(unittest.TestCase):
    def test_nearest_rank(self):
        vals = [100, 200, 300, 400]
        self.assertEqual(percentile(vals, 50), 200)
        self.assertEqual(percentile(vals, 75), 300)
        self.assertEqual(percentile(vals, 100), 400)

    def test_single_value(self):
        self.assertEqual(percentile([1234], 75), 1234)

    def test_unsorted_input(self):
        self.assertEqual(percentile([400, 100, 300, 200], 75), 300)


if __name__ == "__main__":
    unittest.main()
