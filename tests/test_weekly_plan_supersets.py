#!/usr/bin/env python3
"""Tests for the superset-metadata validator in scripts/weekly_plan.py.

Run: python3 -m unittest discover -s tests -v

These guard a check that exists because a bad plan is SILENT — the 2026-07-27 Week 2
rows rendered as straight sets while their name and notes described supersets. Nothing
threw. If this validator ever stops firing, the failure mode is invisible again, so the
validator needs its own tests more than most.
"""

import os
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))

# weekly_plan reads CRON_SECRET and INTERNAL_APP_URL/APP_URL at import time and exits
# without them. These are never used by the pure validators under test.
os.environ.setdefault("CRON_SECRET", "test")
os.environ.setdefault("INTERNAL_APP_URL", "http://localhost:3000")

from weekly_plan import validate_supersets  # noqa: E402


def ex(name, slot=None, partner=None, sets=3):
    e = {"exercise": name, "sets": sets, "reps": "10"}
    if slot:
        e["superset"] = slot
    if partner:
        e["pair_with"] = partner
    return e


def day(entries, name="Week 2A - Squat + Horizontal Push/Pull (supersets)", date="2026-07-27"):
    return {"workout_days": [{"date": date, "name": name, "workout": entries}]}


GOOD = [
    ex("DB Goblet Squat", "A1", "Plank"),
    ex("Plank", "A2", "DB Goblet Squat"),
    ex("DB Chest Press (floor)", "B1", "DB Bent-Over Row"),
    ex("DB Bent-Over Row", "B2", "DB Chest Press (floor)"),
    ex("DB Overhead Press", "C1", "DB Reverse Fly"),
    ex("DB Reverse Fly", "C2", "DB Overhead Press"),
]


class TestValidateSupersets(unittest.TestCase):
    def test_well_formed_plan_passes(self):
        self.assertEqual(validate_supersets(day(GOOD)), [])

    def test_the_2026_07_27_regression(self):
        """Name claims supersets, no exercise carries a slot. The original bug."""
        bare = [ex(e["exercise"]) for e in GOOD]
        problems = validate_supersets(day(bare))
        self.assertEqual(len(problems), 1)
        self.assertIn("no exercise carries a `superset` slot", problems[0])

    def test_straight_set_day_without_superset_in_name_is_exempt(self):
        bare = [ex(e["exercise"]) for e in GOOD]
        self.assertEqual(validate_supersets(day(bare, name="Week 1A - Full Body")), [])

    def test_single_exercise_gtg_day_is_exempt(self):
        plan = day([ex("Pull-ups (grease-the-groove)", sets=5)], name="Daily Pull-ups (GtG)")
        self.assertEqual(validate_supersets(plan), [])

    def test_partial_slotting_is_rejected(self):
        entries = [dict(e) for e in GOOD]
        del entries[5]["superset"]
        problems = validate_supersets(day(entries))
        self.assertTrue(any("5/6 working exercises" in p for p in problems))

    def test_non_adjacent_pairs_are_rejected(self):
        """Grouping is positional — A1, B1, A2, B2 renders as broken groups."""
        entries = [GOOD[0], GOOD[2], GOOD[1], GOOD[3], GOOD[4], GOOD[5]]
        problems = validate_supersets(day(entries))
        self.assertTrue(any("not contiguous" in p for p in problems))

    def test_malformed_slot_is_rejected(self):
        entries = [dict(e) for e in GOOD]
        entries[0]["superset"] = "pair-A"
        problems = validate_supersets(day(entries))
        self.assertTrue(any("malformed superset slot" in p for p in problems))

    def test_lone_slot_is_rejected(self):
        entries = [
            ex("DB Goblet Squat", "A1", "Plank"),
            ex("Plank", "B1", "DB Goblet Squat"),
        ]
        problems = validate_supersets(day(entries))
        self.assertTrue(any("only" in p and "at least two" in p for p in problems))

    def test_non_reciprocal_pair_with_is_rejected(self):
        entries = [dict(e) for e in GOOD]
        entries[1]["pair_with"] = "DB Bent-Over Row"  # points into superset B
        problems = validate_supersets(day(entries))
        self.assertTrue(any("not in superset A" in p for p in problems))

    def test_missing_pair_with_is_rejected(self):
        entries = [dict(e) for e in GOOD]
        del entries[3]["pair_with"]
        problems = validate_supersets(day(entries))
        self.assertTrue(any("has no `pair_with`" in p for p in problems))

    def test_pair_with_naming_an_absent_exercise_is_rejected(self):
        entries = [dict(e) for e in GOOD]
        entries[4]["pair_with"] = "DB Chest Fly (floor)"
        problems = validate_supersets(day(entries))
        self.assertTrue(any("no such exercise" in p for p in problems))

    def test_self_pairing_is_rejected(self):
        entries = [dict(e) for e in GOOD]
        entries[0]["pair_with"] = "DB Goblet Squat"
        problems = validate_supersets(day(entries))
        self.assertTrue(any("paired with itself" in p for p in problems))

    def test_out_of_order_digits_are_rejected(self):
        entries = [dict(e) for e in GOOD]
        entries[0]["superset"] = "A2"
        entries[1]["superset"] = "A3"
        problems = validate_supersets(day(entries))
        self.assertTrue(any("numbered [2, 3]" in p for p in problems))

    def test_mismatched_sets_within_a_pair_are_rejected(self):
        entries = [dict(e) for e in GOOD]
        entries[1]["sets"] = 2
        problems = validate_supersets(day(entries))
        self.assertTrue(any("disagree on `sets`" in p for p in problems))

    def test_tri_set_of_three_is_accepted(self):
        entries = [
            ex("DB Goblet Squat", "A1", "Plank"),
            ex("Plank", "A2", "DB Goblet Squat"),
            ex("DB Calf Raise", "A3", "Plank"),
            ex("DB Chest Press (floor)", "B1", "DB Bent-Over Row"),
            ex("DB Bent-Over Row", "B2", "DB Chest Press (floor)"),
        ]
        self.assertEqual(validate_supersets(day(entries)), [])

    def test_warmup_and_cooldown_are_not_required_to_be_slotted(self):
        plan = day(GOOD)
        plan["workout_days"][0]["warmup"] = [ex("Leg Swing")]
        plan["workout_days"][0]["cooldown"] = [ex("Dead Hang")]
        self.assertEqual(validate_supersets(plan), [])

    def test_every_day_is_checked_not_just_the_first(self):
        plan = day(GOOD)
        plan["workout_days"].append(
            {"date": "2026-07-29", "name": "Week 2B (supersets)",
             "workout": [ex("DB Romanian Deadlift"), ex("DB Floor Press")]}
        )
        problems = validate_supersets(plan)
        self.assertEqual(len(problems), 1)
        self.assertIn("2026-07-29", problems[0])


if __name__ == "__main__":
    unittest.main()
